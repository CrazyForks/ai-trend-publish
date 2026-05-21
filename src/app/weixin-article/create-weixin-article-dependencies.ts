import { ContentRanker } from "@src/modules/content-rank/ai.content-ranker.ts";
import { AISummarizer } from "@src/modules/summarizer/ai.summarizer.ts";
import { WeixinPublisher } from "@src/integrations/publish/providers/weixin-publisher.ts";
import { WeixinArticleTemplateRenderer } from "@src/features/weixin-article/rendering/article.renderer.ts";
import { WeixinDynamicHtmlGenerator } from "@src/features/weixin-article/rendering/dynamic/dynamic-html.generator.ts";
import { ImageGeneratorResolver } from "@src/integrations/image/image-generator-resolver.ts";
import { LlmProviderResolver } from "@src/integrations/llm/llm-provider-resolver.ts";
import { EmbeddingProviderResolver } from "@src/integrations/vector/embedding-provider-resolver.ts";
import { VectorService } from "@src/integrations/vector/vector-store.service.ts";
import { createMysqlDatabase } from "@src/db/db.ts";
import { EmbeddingProviderType } from "@src/core/ports/embedding.ts";
import { planArticleSources } from "@src/app/weixin-article/fetch/article-fetch-planner.ts";
import { ArticleFetchRouter } from "@src/app/weixin-article/fetch/article-fetch-router.ts";
import { createArticleNotifier } from "@src/app/weixin-article/notifications.ts";
import { WeixinArticleDependencies } from "@src/features/weixin-article/dependencies.ts";
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

export async function createWeixinArticleDependencies(
  config: ResolvedTrendPublishConfig,
): Promise<WeixinArticleDependencies> {
  const stats = {
    success: 0,
    failed: 0,
    contents: 0,
    duplicates: 0,
  };
  const publisher = new WeixinPublisher(config.providers.publish.weixin);
  const notifier = createArticleNotifier(config);
  const llmResolver = new LlmProviderResolver(config);
  const llmProvider = await llmResolver.getDefaultProvider();
  const imageGeneratorResolver = new ImageGeneratorResolver(config);
  const embeddingResolver = new EmbeddingProviderResolver(config);
  const bodyImages = config.features.article.bodyImages;
  const deduplication = config.features.article.deduplication;
  const renderer = config.features.article.renderer;
  const promptProfile = renderer.promptProfile;
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
      async () => {
        const database = createMysqlDatabase(config.storage.mysql);
        return new VectorService(database.db);
      },
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
    dryRunOutputService: new WeixinArticleDryRunOutputService(),
    contentRanker: new ContentRanker(llmProvider, promptProfile),
    stats,
    config: {
      dryRun: config.features.article.dryRun,
    },
  };
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
