import {
  WorkflowEvent,
  WorkflowStepContext,
  WorkflowStepOptions,
} from "@src/core/workflow/workflow-runtime.ts";
import { WorkflowTerminateError } from "@src/core/workflow/workflow-error.ts";
import { Logger } from "@zilla/logger";
import { WeixinArticleDependencies } from "@src/features/weixin-article/dependencies.ts";
import type { ArtifactRef } from "@src/core/ports/artifact-store.ts";
import type { PublishResult } from "@src/core/ports/content-publisher.ts";
import type { RankResult } from "@src/core/ports/content-ranker.ts";
import type { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import type { WeixinTemplate } from "@src/features/weixin-article/domain/renderable-article.ts";
import type { WeixinArticleSourceLoadResult } from "@src/features/weixin-article/services/content-scrape.service.ts";

const logger = new Logger("weixin-article-workflow");

interface WeixinWorkflowEnv {
  id: string;
  name: string;
}

interface WeixinWorkflowParams {
  sourceType?: "all" | "firecrawl" | "twitter";
  maxArticles?: number;
  forcePublish?: boolean;
  dryRun?: boolean;
  dryRunOutputDir?: string;
  runId?: string;
  trigger?: "manual" | "cron";
}

export interface WeixinArticleWorkflowConfig {
  dryRun: boolean;
}

interface StepResult<T> {
  result: T;
  artifacts?: ArtifactRef[];
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
    const runId = event.payload.runId ?? event.id ?? crypto.randomUUID();
    const dryRun = await this.isDryRun(event);
    const artifactStore = this.dependencies.runtime.artifactStore;
    const runStateStore = this.dependencies.runtime.runStateStore;

    try {
      await runStateStore.startRun({
        runId,
        mode: this.dependencies.runtime.mode,
        dryRun,
        trigger: event.payload.trigger ?? "manual",
      });

      logger.info(
        `[工作流开始] 开始执行微信工作流, 当前工作流实例ID: ${this.env.id} 触发事件ID: ${event.id}, runId: ${runId}`,
      );
      this.dependencies.renderService.setUploadContentImages(!dryRun);

      await this.runTrackedStep(step, runId, "validate-ip-whitelist", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "10 minutes",
      }, async () => {
        if (dryRun) {
          logger.info("[DryRun] 跳过微信公众号 IP 白名单验证");
          return { result: true };
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
        return { result: isWhitelisted };
      });

      await this.dependencies.notifier.info(
        "工作流开始",
        "开始执行内容抓取和处理",
      );

      const sourceLoadRef = await this.runTrackedStep(
        step,
        runId,
        "fetch-sources",
        async () => {
          const result = await this.dependencies.scrapeService.loadSources(
            event.payload.sourceType,
          );
          const ref = await artifactStore.putJson(
            artifactStore.createRunKey(runId, "01-sources", "json"),
            result,
            { label: "数据源", contentType: "application/json" },
          );
          return { result: ref, artifacts: [ref] };
        },
      );
      const sourceLoadResult = await artifactStore
        .getJson<WeixinArticleSourceLoadResult>(sourceLoadRef);

      const allContentsRef = await this.runTrackedStep(
        step,
        runId,
        "scrape-contents",
        {
          retries: { limit: 3, delay: "10 second", backoff: "exponential" },
          timeout: "10 minutes",
        },
        async () => {
          const result = await this.dependencies.scrapeService.scrapeAll(
            sourceLoadResult,
          );
          const ref = await artifactStore.putJson(
            artifactStore.createRunKey(runId, "02-scraped-contents", "json"),
            result,
            { label: "抓取结果", contentType: "application/json" },
          );
          return { result: ref, artifacts: [ref] };
        },
        [sourceLoadRef],
      );

      const uniqueContentsRef = await this.runTrackedStep(
        step,
        runId,
        "dedup-contents",
        {
          retries: { limit: 2, delay: "5 second", backoff: "exponential" },
          timeout: "15 minutes",
        },
        async () => {
          const allContents = await artifactStore
            .getJson<ScrapedContent[]>(allContentsRef);
          const result = await this.dependencies.dedupService.deduplicate(
            allContents,
          );
          const ref = await artifactStore.putJson(
            artifactStore.createRunKey(runId, "03-unique-contents", "json"),
            result,
            { label: "去重后内容", contentType: "application/json" },
          );
          return { result: ref, artifacts: [ref] };
        },
        [allContentsRef],
      );

      const rankedContentsRef = await this.runTrackedStep(
        step,
        runId,
        "rank-contents",
        {
          retries: { limit: 2, delay: "5 second", backoff: "exponential" },
          timeout: "5 minutes",
        },
        async () => {
          const uniqueContents = await artifactStore
            .getJson<ScrapedContent[]>(uniqueContentsRef);
          logger.info(`[内容排序] 开始排序 ${uniqueContents.length} 条内容`);
          const ranked = await this.dependencies.contentRanker.rankContents(
            uniqueContents,
          );
          if (ranked.length === 0) {
            throw new WorkflowTerminateError(
              "内容排序失败，没有任何内容被评分",
            );
          }
          ranked.sort((a, b) => b.score - a.score);
          logger.info("[内容排序] 内容排序完成");
          const ref = await artifactStore.putJson(
            artifactStore.createRunKey(runId, "04-ranked-contents", "json"),
            ranked,
            { label: "排序结果", contentType: "application/json" },
          );
          return { result: ref, artifacts: [ref] };
        },
        [uniqueContentsRef],
      );

      const processedContentsRef = await this.runTrackedStep(
        step,
        runId,
        "process-contents",
        {
          retries: { limit: 2, delay: "5 second", backoff: "exponential" },
          timeout: "15 minutes",
        },
        async () => {
          const rankedContents = await artifactStore
            .getJson<RankResult[]>(rankedContentsRef);
          const uniqueContents = await artifactStore
            .getJson<ScrapedContent[]>(uniqueContentsRef);
          const result = await this.dependencies.processService
            .processTopRanked(
              rankedContents,
              uniqueContents,
              event.payload.maxArticles,
            );
          const ref = await artifactStore.putJson(
            artifactStore.createRunKey(runId, "05-processed-contents", "json"),
            result,
            { label: "处理后文章", contentType: "application/json" },
          );
          return { result: ref, artifacts: [ref] };
        },
        [rankedContentsRef, uniqueContentsRef],
      );

      const templateDataRef = await this.runTrackedStep(
        step,
        runId,
        "prepare-template-data",
        async () => {
          const processedContents = await artifactStore
            .getJson<ScrapedContent[]>(processedContentsRef);
          const result = this.dependencies.renderService.toTemplateData(
            processedContents,
          );
          const ref = await artifactStore.putJson(
            artifactStore.createRunKey(runId, "06-template-data", "json"),
            result,
            { label: "模板数据", contentType: "application/json" },
          );
          return { result: ref, artifacts: [ref] };
        },
        [processedContentsRef],
      );

      const titleRef = await this.runTrackedStep(
        step,
        runId,
        "generate-title",
        {
          retries: { limit: 1, delay: "2 second", backoff: "linear" },
          timeout: "10 minutes",
        },
        async () => {
          const processedContents = await artifactStore
            .getJson<ScrapedContent[]>(processedContentsRef);
          const result = await this.dependencies.titleService
            .generateSummaryTitle(processedContents);
          const ref = await artifactStore.putJson(
            artifactStore.createRunKey(runId, "07-title", "json"),
            { title: result },
            { label: "标题", contentType: "application/json" },
          );
          return { result: ref, artifacts: [ref] };
        },
        [processedContentsRef],
      );
      const summaryTitle = (await artifactStore.getJson<{ title: string }>(
        titleRef,
      )).title;

      const coverRef = await this.runTrackedStep(
        step,
        runId,
        "generate-cover",
        {
          retries: { limit: 2, delay: "5 second", backoff: "exponential" },
          timeout: "5 minutes",
        },
        async () => {
          const mediaId = dryRun
            ? "dry-run-media-id"
            : await this.dependencies.coverService.generateCoverMediaId(
              summaryTitle,
            );
          const ref = await artifactStore.putJson(
            artifactStore.createRunKey(runId, "08-cover", "json"),
            { mediaId },
            { label: "封面", contentType: "application/json" },
          );
          return { result: ref, artifacts: [ref] };
        },
        [titleRef],
      );
      const mediaId = (await artifactStore.getJson<{ mediaId: string }>(
        coverRef,
      )).mediaId;

      const renderedTemplateRef = await this.runTrackedStep(
        step,
        runId,
        "render-article-template",
        {
          retries: { limit: 1, delay: "2 second", backoff: "linear" },
          timeout: "5 minutes",
        },
        async () => {
          const templateData = await artifactStore
            .getJson<WeixinTemplate[]>(templateDataRef);
          const html = await this.dependencies.renderService.render(
            templateData,
          );
          const ref = await artifactStore.putText(
            artifactStore.createRunKey(runId, "09-rendered-article", "html"),
            html,
            {
              label: "微信正文 HTML",
              contentType: "text/html; charset=utf-8",
            },
          );
          return { result: ref, artifacts: [ref] };
        },
        [templateDataRef],
      );

      const publishRef = await this.runTrackedStep(
        step,
        runId,
        "publish-article",
        {
          retries: { limit: 3, delay: "10 second", backoff: "exponential" },
          timeout: "5 minutes",
        },
        async () => {
          const publishResultKey = artifactStore.createRunKey(
            runId,
            "10-publish-result",
            "json",
          );
          const existingPublishResult = await artifactStore.getObject(
            publishResultKey,
          );
          if (existingPublishResult) {
            const ref: ArtifactRef = {
              ...existingPublishResult.ref,
              label: existingPublishResult.ref.label ?? "发布结果",
            };
            return { result: ref, artifacts: [ref] };
          }

          const renderedTemplate = await artifactStore.getText(
            renderedTemplateRef,
          );
          const dryRunPreviewRef = dryRun
            ? await this.dependencies.dryRunOutputService.writeHtml(
              runId,
              renderedTemplate,
            )
            : undefined;
          const publishResult = dryRun
            ? {
              publishId: "dry-run",
              status: "draft" as const,
              publishedAt: new Date(),
              platform: "weixin",
              url: dryRunPreviewRef?.key,
            }
            : await this.publishArticle(
              renderedTemplate,
              summaryTitle,
              mediaId,
            );
          const ref = await artifactStore.putJson(
            publishResultKey,
            publishResult,
            { label: "发布结果", contentType: "application/json" },
          );
          return {
            result: ref,
            artifacts: [dryRunPreviewRef, ref].filter(Boolean) as ArtifactRef[],
          };
        },
        [renderedTemplateRef, titleRef, coverRef],
      );

      const summary = `
        工作流执行完成
        - 数据源: ${sourceLoadResult.totalSources} 个
        - 成功: ${this.dependencies.stats.success} 个
        - 失败: ${this.dependencies.stats.failed} 个
        - 内容: ${this.dependencies.stats.contents} 条
        - 重复: ${this.dependencies.stats.duplicates} 条
        - 发布: ${dryRun ? "DryRun(未发布)" : "成功"}`.trim();

      await runStateStore.finishRun(runId, {
        summary,
        artifacts: (await runStateStore.getRun(runId))?.artifacts ??
          [publishRef],
      });

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

      await runStateStore.failRun(runId, message).catch(() => {});

      if (error instanceof WorkflowTerminateError) {
        await this.dependencies.notifier.warning("工作流终止", message);
        throw error;
      }

      logger.error("[工作流] 执行失败:", message);
      await this.dependencies.notifier.error("工作流失败", message);
      throw error;
    }
  }

  private async runTrackedStep<T>(
    step: WorkflowStepContext,
    runId: string,
    name: string,
    optionsOrFn:
      | WorkflowStepOptions
      | (() => Promise<StepResult<T>>),
    fnOrInputArtifacts?:
      | (() => Promise<StepResult<T>>)
      | ArtifactRef[],
    maybeInputArtifacts: ArtifactRef[] = [],
  ): Promise<T> {
    const options = typeof optionsOrFn === "function" ? undefined : optionsOrFn;
    const fn = typeof optionsOrFn === "function"
      ? optionsOrFn
      : fnOrInputArtifacts as () => Promise<StepResult<T>>;
    const inputArtifacts = Array.isArray(fnOrInputArtifacts)
      ? fnOrInputArtifacts
      : maybeInputArtifacts;

    const executor = async () => {
      await this.dependencies.runtime.runStateStore.startStep(runId, name, {
        inputArtifacts,
      });
      try {
        const stepResult = await fn();
        await this.dependencies.runtime.runStateStore.finishStep(runId, name, {
          outputArtifacts: stepResult.artifacts ?? [],
        });
        return stepResult.result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.dependencies.runtime.runStateStore.failStep(
          runId,
          name,
          message,
        ).catch(() => {});
        throw error;
      }
    };

    if (options) {
      return await step.do(name, options, executor);
    }
    return await step.do(name, executor);
  }

  private async publishArticle(
    renderedTemplate: string,
    summaryTitle: string,
    mediaId: string,
  ): Promise<PublishResult> {
    logger.info("[发布] 发布到微信公众号");
    return await this.dependencies.publisher.publishArticle({
      content: renderedTemplate,
      title: summaryTitle,
      digest: summaryTitle,
      coverMediaId: mediaId,
    });
  }

  private async isDryRun(
    event: WorkflowEvent<WeixinWorkflowParams>,
  ): Promise<boolean> {
    if (event.payload.forcePublish) {
      return false;
    }
    if (event.payload.dryRun) {
      return true;
    }
    return this.dependencies.config.dryRun;
  }
}
