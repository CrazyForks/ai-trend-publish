import { ContentRanker } from "@src/modules/content-rank/ai.content-ranker.ts";
import { BarkNotifier } from "@src/modules/notify/bark.notify.ts";
import { WeixinPublisher } from "@src/modules/publishers/weixin.publisher.ts";
import { AISummarizer } from "@src/modules/summarizer/ai.summarizer.ts";
import { WeixinArticleTemplateRenderer } from "../modules/render/weixin/article.renderer.ts";
import { ConfigManager } from "@src/utils/config/config-manager.ts";
import {
  WorkflowEntrypoint,
  WorkflowEnv,
  WorkflowEvent,
  WorkflowStep,
} from "@src/works/workflow.ts";
import { WorkflowTerminateError } from "@src/works/workflow-error.ts";
import { Logger } from "@zilla/logger";
import { WeixinArticleTitleService } from "@src/services/weixin-article/article-title.service.ts";
import { WeixinArticleCoverService } from "@src/services/weixin-article/article-cover.service.ts";
import { WeixinArticleRenderService } from "@src/services/weixin-article/article-render.service.ts";
import { WeixinArticleDryRunOutputService } from "@src/services/weixin-article/dry-run-output.service.ts";
import { WeixinArticleContentScrapeService } from "@src/services/weixin-article/content-scrape.service.ts";
import { WeixinArticleContentDedupService } from "@src/services/weixin-article/content-dedup.service.ts";
import { WeixinArticleContentProcessService } from "@src/services/weixin-article/content-process.service.ts";
import { WeixinArticleWorkflowStats } from "@src/services/weixin-article/workflow-stats.ts";
const logger = new Logger("weixin-article-workflow");

interface WeixinWorkflowEnv {
  name: string;
}

// 工作流参数类型定义
interface WeixinWorkflowParams {
  sourceType?: "all" | "firecrawl" | "twitter";
  maxArticles?: number;
  forcePublish?: boolean;
  dryRun?: boolean;
  dryRunOutputDir?: string;
}

export class WeixinArticleWorkflow
  extends WorkflowEntrypoint<WeixinWorkflowEnv, WeixinWorkflowParams> {
  private publisher: WeixinPublisher;
  private notifier: BarkNotifier;
  private scrapeService: WeixinArticleContentScrapeService;
  private dedupService: WeixinArticleContentDedupService;
  private processService: WeixinArticleContentProcessService;
  private titleService: WeixinArticleTitleService;
  private coverService: WeixinArticleCoverService;
  private renderService: WeixinArticleRenderService;
  private dryRunOutputService: WeixinArticleDryRunOutputService;
  private contentRanker: ContentRanker;
  private stats: WeixinArticleWorkflowStats = {
    success: 0,
    failed: 0,
    contents: 0,
    duplicates: 0,
  };

  constructor(env: WorkflowEnv<WeixinWorkflowEnv>) {
    super(env);
    this.publisher = new WeixinPublisher();
    this.notifier = new BarkNotifier();
    this.scrapeService = new WeixinArticleContentScrapeService(
      this.notifier,
      this.stats,
    );
    this.dedupService = new WeixinArticleContentDedupService(this.stats);
    this.processService = new WeixinArticleContentProcessService(
      new AISummarizer(),
      this.notifier,
    );
    this.titleService = new WeixinArticleTitleService();
    this.coverService = new WeixinArticleCoverService(this.publisher);
    this.renderService = new WeixinArticleRenderService(
      new WeixinArticleTemplateRenderer(),
    );
    this.dryRunOutputService = new WeixinArticleDryRunOutputService();
    this.contentRanker = new ContentRanker();
  }

  public getWorkflowStats(eventId: string) {
    return this.metricsCollector.getWorkflowEventMetrics(this.env.id, eventId);
  }

  async run(
    event: WorkflowEvent<WeixinWorkflowParams>,
    step: WorkflowStep,
  ): Promise<void> {
    try {
      logger.info(
        `[工作流开始] 开始执行微信工作流, 当前工作流实例ID: ${this.env.id} 触发事件ID: ${event.id}`,
      );
      const dryRun = await this.isDryRun(event);
      this.renderService.setUploadContentImages(!dryRun);

      // 验证IP白名单
      await step.do("validate-ip-whitelist", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "10 minutes",
      }, async () => {
        if (dryRun) {
          logger.info("[DryRun] 跳过微信公众号 IP 白名单验证");
          return true;
        }
        const isWhitelisted = await this.publisher.validateIpWhitelist();
        if (typeof isWhitelisted === "string") {
          this.notifier.warning(
            "IP白名单验证失败",
            `当前服务器IP(${isWhitelisted})不在微信公众号IP白名单中，请在微信公众平台添加此IP地址`,
          );
          throw new WorkflowTerminateError(
            `当前服务器IP(${isWhitelisted})不在微信公众号IP白名单中，请在微信公众平台添加此IP地址`,
          );
        }
        return isWhitelisted;
      });
      await this.notifier.info("工作流开始", "开始执行内容抓取和处理");

      // 获取数据源
      const sourceLoadResult = await step.do(
        "fetch-sources",
        async () => this.scrapeService.loadSources(event.payload.sourceType),
      );

      // 3. 抓取内容
      const allContents = await step.do("scrape-contents", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "10 minutes",
      }, () => this.scrapeService.scrapeAll(sourceLoadResult));

      // 4. 内容去重
      const uniqueContents = await step.do("dedup-contents", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "15 minutes",
      }, () => this.dedupService.deduplicate(allContents));

      // 5. 内容排序
      const rankedContents = await step.do("rank-contents", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "5 minutes",
      }, async () => {
        logger.info(`[内容排序] 开始排序 ${uniqueContents.length} 条内容`);
        const ranked = await this.contentRanker.rankContents(uniqueContents);
        if (ranked.length === 0) {
          throw new WorkflowTerminateError("内容排序失败，没有任何内容被评分");
        }
        // 按分数排序
        ranked.sort((a, b) => b.score - a.score);
        logger.info("[内容排序] 内容排序完成");
        return ranked;
      });

      // 6. 处理排序后的内容
      const processedContents = await step.do("process-contents", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "15 minutes",
      }, () =>
        this.processService.processTopRanked(
          rankedContents,
          uniqueContents,
          event.payload.maxArticles,
        ));

      // 7. 准备模板数据
      const templateData = this.renderService.toTemplateData(processedContents);

      const summaryTitle = await step.do(
        "generate-title",
        {
          retries: { limit: 1, delay: "2 second", backoff: "linear" },
          timeout: "10 minutes",
        },
        async () => this.titleService.generateSummaryTitle(processedContents),
      );

      const mediaId = dryRun ? "dry-run-media-id" : await step.do(
        "generate-cover",
        {
          retries: { limit: 2, delay: "5 second", backoff: "exponential" },
          timeout: "5 minutes",
        },
        () => this.coverService.generateCoverMediaId(summaryTitle),
      );

      const renderedTemplate = await step.do(
        "render-article-template",
        {
          retries: { limit: 1, delay: "2 second", backoff: "linear" },
          timeout: "5 minutes",
        },
        () => this.renderService.render(templateData),
      );

      // 8. 发布文章
      await step.do("publish-article", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "5 minutes",
      }, async () => {
        if (dryRun) {
          const outputPath = await this.dryRunOutputService.writeHtml(
            renderedTemplate,
            event.payload.dryRunOutputDir,
          );
          logger.info(`[DryRun] 跳过发布，HTML 已输出到: ${outputPath}`);
          return {
            publishId: "dry-run",
            status: "draft" as const,
            publishedAt: new Date(),
            platform: "weixin",
            url: outputPath,
          };
        }
        logger.info("[发布] 发布到微信公众号");
        return await this.publisher.publish(
          renderedTemplate,
          summaryTitle,
          summaryTitle,
          mediaId,
        );
      });

      // 9. 完成报告
      const summary = `
        工作流执行完成
        - 数据源: ${sourceLoadResult.totalSources} 个
        - 成功: ${this.stats.success} 个
        - 失败: ${this.stats.failed} 个
        - 内容: ${this.stats.contents} 条
        - 重复: ${this.stats.duplicates} 条
        - 发布: ${dryRun ? "DryRun(未发布)" : "成功"}`.trim();

      logger.info(`[工作流完成] ${summary}`);

      if (this.stats.failed > 0) {
        await this.notifier.warning("工作流完成(部分失败)", summary);
      } else {
        await this.notifier.success("工作流完成", summary);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // 如果是终止错误，发送通知后直接抛出
      if (error instanceof WorkflowTerminateError) {
        await this.notifier.warning("工作流终止", message);
        throw error;
      }

      logger.error("[工作流] 执行失败:", message);
      await this.notifier.error("工作流失败", message);
      throw error;
    }
  }

  private async isDryRun(
    event: WorkflowEvent<WeixinWorkflowParams>,
  ): Promise<boolean> {
    if (event.payload.dryRun) {
      return true;
    }
    return await ConfigManager.getInstance().get<boolean>("DRY_RUN").catch(() =>
      false
    );
  }
}
