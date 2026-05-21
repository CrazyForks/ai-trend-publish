import {
  WorkflowEvent,
  WorkflowStepContext,
} from "@src/core/workflow/workflow-runtime.ts";
import { WorkflowTerminateError } from "@src/core/workflow/workflow-error.ts";
import { Logger } from "@zilla/logger";
import { WeixinArticleDependencies } from "@src/features/weixin-article/dependencies.ts";
const logger = new Logger("weixin-article-workflow");

interface WeixinWorkflowEnv {
  id: string;
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

export interface WeixinArticleWorkflowConfig {
  dryRun: boolean;
}

export class WeixinArticleWorkflow {
  constructor(
    private readonly env: WeixinWorkflowEnv,
    private readonly dependencies: WeixinArticleDependencies,
  ) {
  }

  async run(
    event: WorkflowEvent<WeixinWorkflowParams>,
    step: WorkflowStepContext,
  ): Promise<void> {
    try {
      logger.info(
        `[工作流开始] 开始执行微信工作流, 当前工作流实例ID: ${this.env.id} 触发事件ID: ${event.id}`,
      );
      const dryRun = await this.isDryRun(event);
      this.dependencies.renderService.setUploadContentImages(!dryRun);

      // 验证IP白名单
      await step.do("validate-ip-whitelist", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "10 minutes",
      }, async () => {
        if (dryRun) {
          logger.info("[DryRun] 跳过微信公众号 IP 白名单验证");
          return true;
        }
        const isWhitelisted = await this.dependencies.publisher
          .validateIpWhitelist();
        if (typeof isWhitelisted === "string") {
          this.dependencies.notifier.warning(
            "IP白名单验证失败",
            `当前服务器IP(${isWhitelisted})不在微信公众号IP白名单中，请在微信公众平台添加此IP地址`,
          );
          throw new WorkflowTerminateError(
            `当前服务器IP(${isWhitelisted})不在微信公众号IP白名单中，请在微信公众平台添加此IP地址`,
          );
        }
        return isWhitelisted;
      });
      await this.dependencies.notifier.info(
        "工作流开始",
        "开始执行内容抓取和处理",
      );

      // 获取数据源
      const sourceLoadResult = await step.do(
        "fetch-sources",
        async () =>
          this.dependencies.scrapeService.loadSources(event.payload.sourceType),
      );

      // 3. 抓取内容
      const allContents = await step.do("scrape-contents", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "10 minutes",
      }, () => this.dependencies.scrapeService.scrapeAll(sourceLoadResult));

      // 4. 内容去重
      const uniqueContents = await step.do("dedup-contents", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "15 minutes",
      }, () => this.dependencies.dedupService.deduplicate(allContents));

      // 5. 内容排序
      const rankedContents = await step.do("rank-contents", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "5 minutes",
      }, async () => {
        logger.info(`[内容排序] 开始排序 ${uniqueContents.length} 条内容`);
        const ranked = await this.dependencies.contentRanker.rankContents(
          uniqueContents,
        );
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
        this.dependencies.processService.processTopRanked(
          rankedContents,
          uniqueContents,
          event.payload.maxArticles,
        ));

      // 7. 准备模板数据
      const templateData = this.dependencies.renderService.toTemplateData(
        processedContents,
      );

      const summaryTitle = await step.do(
        "generate-title",
        {
          retries: { limit: 1, delay: "2 second", backoff: "linear" },
          timeout: "10 minutes",
        },
        async () =>
          this.dependencies.titleService.generateSummaryTitle(
            processedContents,
          ),
      );

      const mediaId = dryRun ? "dry-run-media-id" : await step.do(
        "generate-cover",
        {
          retries: { limit: 2, delay: "5 second", backoff: "exponential" },
          timeout: "5 minutes",
        },
        () => this.dependencies.coverService.generateCoverMediaId(summaryTitle),
      );

      const renderedTemplate = await step.do(
        "render-article-template",
        {
          retries: { limit: 1, delay: "2 second", backoff: "linear" },
          timeout: "5 minutes",
        },
        () => this.dependencies.renderService.render(templateData),
      );

      // 8. 发布文章
      await step.do("publish-article", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "5 minutes",
      }, async () => {
        if (dryRun) {
          const outputPath = await this.dependencies.dryRunOutputService
            .writeHtml(
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
        return await this.dependencies.publisher.publishArticle({
          content: renderedTemplate,
          title: summaryTitle,
          digest: summaryTitle,
          coverMediaId: mediaId,
        });
      });

      // 9. 完成报告
      const summary = `
        工作流执行完成
        - 数据源: ${sourceLoadResult.totalSources} 个
        - 成功: ${this.dependencies.stats.success} 个
        - 失败: ${this.dependencies.stats.failed} 个
        - 内容: ${this.dependencies.stats.contents} 条
        - 重复: ${this.dependencies.stats.duplicates} 条
        - 发布: ${dryRun ? "DryRun(未发布)" : "成功"}`.trim();

      logger.info(`[工作流完成] ${summary}`);

      if (this.dependencies.stats.failed > 0) {
        await this.dependencies.notifier.warning(
          "工作流完成(部分失败)",
          summary,
        );
      } else {
        await this.dependencies.notifier.success("工作流完成", summary);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // 如果是终止错误，发送通知后直接抛出
      if (error instanceof WorkflowTerminateError) {
        await this.dependencies.notifier.warning("工作流终止", message);
        throw error;
      }

      logger.error("[工作流] 执行失败:", message);
      await this.dependencies.notifier.error("工作流失败", message);
      throw error;
    }
  }

  private async isDryRun(
    event: WorkflowEvent<WeixinWorkflowParams>,
  ): Promise<boolean> {
    if (event.payload.dryRun) {
      return true;
    }
    return this.dependencies.config.dryRun;
  }
}
