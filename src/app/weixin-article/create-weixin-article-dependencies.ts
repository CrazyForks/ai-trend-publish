import { ContentRanker } from "@src/modules/content-rank/ai.content-ranker.ts";
import { AISummarizer } from "@src/modules/summarizer/ai.summarizer.ts";
import { WeixinPublisher } from "@src/integrations/publish/providers/weixin-publisher.ts";
import { WeixinRelayPublisher } from "@src/integrations/publish/providers/weixin-relay-publisher.ts";
import { WeixinArticleTemplateRenderer } from "@src/features/weixin-article/rendering/article.renderer.ts";
import { WeixinDynamicHtmlGenerator } from "@src/features/weixin-article/rendering/dynamic/dynamic-html.generator.ts";
import { ImageGeneratorResolver } from "@src/integrations/image/image-generator-resolver.ts";
import { LlmProviderResolver } from "@src/integrations/llm/llm-provider-resolver.ts";
import { EmbeddingProviderResolver } from "@src/integrations/vector/embedding-provider-resolver.ts";
import { EmbeddingProviderType } from "@src/core/ports/embedding.ts";
import { planArticleSources } from "@src/app/weixin-article/fetch/article-fetch-planner.ts";
import { ArticleFetchRouter } from "@src/app/weixin-article/fetch/article-fetch-router.ts";
import { createArticleNotifier } from "@src/app/weixin-article/notifications.ts";
import type {
  WeixinArticleDependencies,
  WeixinArticlePublisher,
} from "@src/features/weixin-article/dependencies.ts";
import {
  AiArticleImageLayoutService,
  WeixinArticleImageLayoutService,
} from "@src/features/weixin-article/services/article-image-layout.service.ts";
import { WeixinArticleContentDedupService } from "@src/features/weixin-article/services/content-dedup.service.ts";
import { WeixinArticleContentProcessService } from "@src/features/weixin-article/services/content-process.service.ts";
import { WeixinArticleContentScrapeService } from "@src/features/weixin-article/services/content-scrape.service.ts";
import { WeixinArticleCoverService } from "@src/features/weixin-article/services/article-cover.service.ts";
import { WeixinArticleDryRunOutputService } from "@src/features/weixin-article/services/dry-run-output.service.ts";
import { WeixinArticleRenderService } from "@src/features/weixin-article/services/article-render.service.ts";
import { WeixinArticleTitleService } from "@src/features/weixin-article/services/article-title.service.ts";
import { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";
import type { ArtifactStore } from "@src/core/ports/artifact-store.ts";
import type {
  RunStateStore,
  RuntimeMode,
} from "@src/core/ports/run-state-store.ts";
import { MemoryArtifactStore } from "@src/core/storage/memory-artifact-store.ts";
import { MemoryRunStateStore } from "@src/core/storage/memory-run-state-store.ts";
import type { VectorStore } from "@src/core/ports/vector-store.ts";

export interface CreateWeixinArticleDependenciesOptions {
  artifactStore?: ArtifactStore;
  runStateStore?: RunStateStore;
  mode?: RuntimeMode;
  vectorStoreFactory?: () => Promise<VectorStore>;
}

export async function createWeixinArticleDependencies(
  config: ResolvedTrendPublishConfig,
  options: CreateWeixinArticleDependenciesOptions = {},
): Promise<WeixinArticleDependencies> {
  const stats = {
    success: 0,
    failed: 0,
    contents: 0,
    duplicates: 0,
  };
  const publisher = createPublisher(config);
  const notifier = createArticleNotifier(config);
  const llmResolver = new LlmProviderResolver(config);
  const llmProvider = await llmResolver.getDefaultProvider();
  const imageGeneratorResolver = new ImageGeneratorResolver(config);
  const embeddingResolver = new EmbeddingProviderResolver(config);
  const bodyImages = config.features.article.bodyImages;
  const deduplication = config.features.article.deduplication;
  const renderer = config.features.article.renderer;
  const promptProfile = renderer.promptProfile;
  const artifactStore = options.artifactStore ?? new MemoryArtifactStore();
  const runStateStore = options.runStateStore ?? new MemoryRunStateStore();
  const imageLayoutService = new AiArticleImageLayoutService(
    new WeixinArticleImageLayoutService(),
    imageGeneratorResolver,
    {
      enabled: bodyImages.mode !== "off",
      imageCount: bodyImages.count,
      onlyWhenNoMedia: bodyImages.mode === "missing",
      imageSize: bodyImages.size,
      promptProfile,
    },
  );

  return {
    publisher,
    notifier,
    scrapeService: new WeixinArticleContentScrapeService(
      planArticleSources(config),
      notifier,
      stats,
      new ArticleFetchRouter(config),
    ),
    dedupService: new WeixinArticleContentDedupService(
      stats,
      {
        enabled: deduplication.enabled,
        providerType: resolveEmbeddingProviderType(
          deduplication.embeddingProvider,
        ),
        model: config.providers.vector.embedding.model,
      },
      embeddingResolver,
      options.vectorStoreFactory ?? (async () => {
        throw new Error(
          `向量去重需要注入 ${config.storage.vector.provider} VectorStore`,
        );
      }),
    ),
    processService: new WeixinArticleContentProcessService(
      new AISummarizer(llmProvider, promptProfile),
      notifier,
      config.features.article.count,
    ),
    titleService: new WeixinArticleTitleService(),
    coverService: new WeixinArticleCoverService(
      publisher,
      imageGeneratorResolver,
      promptProfile,
    ),
    renderService: new WeixinArticleRenderService(
      new WeixinArticleTemplateRenderer(
        new WeixinDynamicHtmlGenerator(llmProvider, promptProfile),
        true,
        imageLayoutService,
        publisher,
        renderer.template,
      ),
    ),
    dryRunOutputService: new WeixinArticleDryRunOutputService(artifactStore),
    contentRanker: new ContentRanker(llmProvider, promptProfile),
    stats,
    runtime: {
      artifactStore,
      runStateStore,
      mode: options.mode ?? "local",
    },
    config: {
      dryRun: config.features.article.dryRun,
    },
  };
}

function createPublisher(
  config: ResolvedTrendPublishConfig,
): WeixinArticlePublisher {
  switch (config.features.article.publisher.provider) {
    case "weixin":
      return new WeixinPublisher(config.providers.publish.weixin);
    case "weixin-relay":
      return new WeixinRelayPublisher(config.providers.publish.weixinRelay);
  }
}

function resolveEmbeddingProviderType(
  provider: ResolvedTrendPublishConfig["features"]["article"]["deduplication"][
    "embeddingProvider"
  ],
): EmbeddingProviderType {
  switch (provider) {
    case "dashscope":
      return EmbeddingProviderType.DASHSCOPE;
  }
}
