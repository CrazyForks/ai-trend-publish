import type { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";

export interface DashboardConfigSummary {
  mode: "local" | "cloudflare-workflow";
  article: {
    dryRunDefault: boolean;
    count: number;
    sourcesCount: number;
    renderer: {
      template: string;
      promptProfile: string;
    };
    publisher: {
      provider: string;
    };
    cover: {
      enabled: boolean;
      provider: string;
      model: string;
    };
    bodyImages: {
      mode: string;
      provider: string;
      count: number;
      size: string;
    };
    deduplication: {
      enabled: boolean;
      embeddingProvider: string;
      vectorStore: string;
    };
    notifications: {
      channels: string[];
    };
  };
  storage: {
    artifacts: string;
    runState: string;
    vector: string;
  };
  fetchGroups: string[];
  providersConfigured: Record<string, boolean>;
}

export function createDashboardConfigSummary(
  config: ResolvedTrendPublishConfig,
  mode: DashboardConfigSummary["mode"],
): DashboardConfigSummary {
  const article = config.features.article;
  return {
    mode,
    article: {
      dryRunDefault: article.dryRun,
      count: article.count,
      sourcesCount: article.sources.length,
      renderer: {
        template: article.renderer.template,
        promptProfile: article.renderer.promptProfile,
      },
      publisher: {
        provider: article.publisher.provider,
      },
      cover: {
        enabled: article.cover.enabled,
        provider: article.cover.provider,
        model: article.cover.model,
      },
      bodyImages: {
        mode: article.bodyImages.mode,
        provider: article.bodyImages.provider,
        count: article.bodyImages.count,
        size: article.bodyImages.size,
      },
      deduplication: {
        enabled: article.deduplication.enabled,
        embeddingProvider: article.deduplication.embeddingProvider,
        vectorStore: article.deduplication.vectorStore,
      },
      notifications: {
        channels: article.notifications.channels,
      },
    },
    storage: {
      artifacts: config.storage.artifacts.provider,
      runState: config.storage.runState.provider,
      vector: config.storage.vector.provider,
    },
    fetchGroups: Object.keys(config.fetchGroups),
    providersConfigured: {
      ai: Boolean(config.providers.ai.apiKey),
      firecrawl: Boolean(config.providers.fetch.firecrawl.apiKey),
      jina: Boolean(config.providers.fetch.jina.apiKey),
      twitter: Boolean(
        config.providers.fetch.twitter.bearerToken ||
          config.providers.fetch.twitter.xquikApiKey,
      ),
      rss: Boolean(config.providers.fetch.rss.baseUrl),
      dashscopeImage: Boolean(config.providers.image.dashscope.apiKey),
      weixin: Boolean(
        config.providers.publish.weixin.appId &&
          config.providers.publish.weixin.appSecret,
      ),
      weixinRelay: Boolean(
        config.providers.publish.weixinRelay.url &&
          config.providers.publish.weixinRelay.token,
      ),
      embedding: Boolean(config.providers.vector.embedding.apiKey),
      bark: Boolean(config.providers.notify.bark.url),
      dingtalk: Boolean(config.providers.notify.dingtalk.webhook),
      feishu: Boolean(config.providers.notify.feishu.webhookUrl),
    },
  };
}
