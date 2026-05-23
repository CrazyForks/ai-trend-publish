import { assertEquals } from "@std/assert";
import {
  defineConfig,
  resolveTrendPublishConfig,
} from "@src/utils/config/define-config.ts";

Deno.test("resolveTrendPublishConfig returns typed resolved config", () => {
  const config = resolveTrendPublishConfig(defineConfig({
    server: { apiKey: "server-key" },
    providers: {
      ai: {
        baseUrl: "https://example.com/v1",
        apiKey: "llm-key",
        model: "model",
      },
      fetch: {
        firecrawl: { apiKey: "firecrawl-key" },
        twitter: { xquikApiKey: "xquik-key" },
      },
      image: {
        dashscope: {
          apiKey: "dashscope-key",
        },
        minimax: {
          apiKey: "minimax-key",
          apiHost: "https://api.minimax.io",
        },
      },
      notify: {
        bark: { url: "https://example.com/bark" },
        dingtalk: { webhook: "https://example.com/dingtalk" },
      },
      vector: {
        embedding: {
          baseUrl: "https://embedding.example.com/v1",
          apiKey: "embedding-key",
          model: "text-embedding-v3",
        },
      },
    },
    fetchGroups: {
      default: ["auto"],
      web: ["firecrawl", "jina"],
    },
    features: {
      article: {
        publisher: {
          provider: "weixin",
        },
        renderer: {
          template: "dynamic",
          promptProfile: "business",
        },
        count: 8,
        dryRun: true,
        notifications: {
          channels: ["bark", "dingtalk"],
        },
        sources: ["web:https://example.com"],
        bodyImages: {
          mode: "missing",
          provider: "minimax",
          count: 1,
          size: "1024*1024",
        },
        deduplication: {
          enabled: true,
          embeddingProvider: "dashscope",
          vectorStore: "sqlite",
        },
      },
    },
    storage: {
      vector: {
        provider: "sqlite",
        sqlitePath: "src/temp/test.sqlite3",
      },
    },
  }));

  assertEquals(config.server.apiKey, "server-key");
  assertEquals(config.providers.ai.model, "model");
  assertEquals(config.features.article.publisher.provider, "weixin");
  assertEquals(config.features.article.renderer.template, "dynamic");
  assertEquals(config.features.article.renderer.promptProfile, "business");
  assertEquals(config.features.article.count, 8);
  assertEquals(config.features.article.dryRun, true);
  assertEquals(config.features.article.sources, ["web:https://example.com"]);
  assertEquals(config.fetchGroups.web, ["firecrawl", "jina"]);
  assertEquals(config.providers.fetch.firecrawl.apiKey, "firecrawl-key");
  assertEquals(config.providers.fetch.twitter.xquikApiKey, "xquik-key");
  assertEquals(config.providers.image.dashscope.apiKey, "dashscope-key");
  assertEquals(config.providers.image.minimax.apiKey, "minimax-key");
  assertEquals(config.features.article.bodyImages.mode, "missing");
  assertEquals(config.features.article.bodyImages.provider, "minimax");
  assertEquals(config.features.article.bodyImages.model, "image-01");
  assertEquals(config.features.article.deduplication.enabled, true);
  assertEquals(
    config.features.article.deduplication.embeddingProvider,
    "dashscope",
  );
  assertEquals(config.features.article.deduplication.vectorStore, "sqlite");
  assertEquals(config.storage.vector.provider, "sqlite");
  assertEquals(config.storage.vector.sqlitePath, "src/temp/test.sqlite3");
  assertEquals(config.features.article.notifications.channels, [
    "bark",
    "dingtalk",
  ]);
  assertEquals(config.providers.notify.bark.url, "https://example.com/bark");
  assertEquals(
    config.providers.notify.dingtalk.webhook,
    "https://example.com/dingtalk",
  );
});

Deno.test("resolveTrendPublishConfig uses feature defaults without provider enablement", () => {
  const config = resolveTrendPublishConfig(defineConfig({}));

  assertEquals(config.features.article.renderer.template, "minimal");
  assertEquals(config.features.article.renderer.promptProfile, "technology");
  assertEquals(config.features.article.deduplication.enabled, false);
  assertEquals(config.features.article.deduplication.vectorStore, "sqlite");
  assertEquals(config.features.article.notifications.channels, []);
  assertEquals(config.providers.vector.embedding.model, "");
  assertEquals(config.providers.notify.bark.url, "");
});
