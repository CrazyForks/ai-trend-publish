import { assertEquals, assertRejects } from "@std/assert";
import { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";
import {
  inferProvider,
  planArticleSources,
  resolveSourceProviders,
} from "./article-fetch-planner.ts";

Deno.test("inferProvider routes common URLs", () => {
  assertEquals(inferProvider("https://x.com/OpenAIDevs"), "twitter");
  assertEquals(inferProvider("https://twitter.com/OpenAIDevs"), "twitter");
  assertEquals(
    inferProvider("https://rsshub.app/github/trending/daily"),
    "rss",
  );
  assertEquals(inferProvider("https://example.com/feed.xml"), "rss");
  assertEquals(inferProvider("https://news.ycombinator.com/"), "firecrawl");
});

Deno.test("resolveSourceProviders expands auto and keeps fallback order", () => {
  assertEquals(
    resolveSourceProviders("https://example.com/", ["firecrawl", "jina"]),
    ["firecrawl", "jina"],
  );
  assertEquals(resolveSourceProviders("https://x.com/OpenAIDevs", ["auto"]), [
    "twitter",
  ]);
});

Deno.test("planArticleSources resolves configured group providers", () => {
  assertEquals(
    planArticleSources({
      ...configFixture(),
      features: {
        article: {
          ...configFixture().features.article,
          sources: [
            "https://news.ycombinator.com/",
            "web:https://example.com/",
          ],
        },
      },
    }).map(({ group, providers, url }) => ({ group, providers, url })),
    [
      {
        group: "default",
        providers: ["firecrawl"],
        url: "https://news.ycombinator.com/",
      },
      {
        group: "web",
        providers: ["firecrawl", "jina"],
        url: "https://example.com/",
      },
    ],
  );
});

Deno.test("planArticleSources validates unknown group", () => {
  assertRejectsLike(() =>
    planArticleSources({
      ...configFixture(),
      features: {
        article: {
          ...configFixture().features.article,
          sources: ["web:https://example.com"],
        },
      },
      fetchGroups: { default: ["auto"] },
    })
  );
});

Deno.test("planArticleSources validates provider config", () => {
  assertRejectsLike(() =>
    planArticleSources({
      ...configFixture(),
      providers: {
        ...configFixture().providers,
        fetch: {
          ...configFixture().providers.fetch,
          twitter: { bearerToken: "", xquikApiKey: "" },
        },
      },
      features: {
        article: {
          ...configFixture().features.article,
          sources: ["https://x.com/OpenAIDevs"],
        },
      },
    })
  );
});

Deno.test("planArticleSources validates default fetch group", () => {
  assertRejectsLike(() =>
    planArticleSources({
      ...configFixture(),
      fetchGroups: { web: ["firecrawl"] },
      features: {
        article: {
          ...configFixture().features.article,
          sources: ["web:https://example.com"],
        },
      },
    })
  );
});

function assertRejectsLike(fn: () => unknown): Promise<unknown> {
  return assertRejects(
    async () => {
      fn();
    },
    Error,
  );
}

function configFixture(): Pick<
  ResolvedTrendPublishConfig,
  "features" | "fetchGroups" | "providers"
> {
  return {
    providers: {
      ai: { baseUrl: "", apiKey: "", model: "" },
      fetch: {
        firecrawl: { apiKey: "firecrawl-key" },
        jina: { apiKey: "jina-key" },
        twitter: { bearerToken: "", xquikApiKey: "xquik-key" },
        rss: { baseUrl: "" },
      },
      image: {
        dashscope: { apiKey: "" },
      },
    },
    fetchGroups: {
      default: ["auto"],
      web: ["firecrawl", "jina"],
    },
    features: {
      article: {
        sources: ["https://news.ycombinator.com/"],
        renderer: {
          template: "minimal",
          promptProfile: "technology",
        },
        publisher: {
          provider: "weixin",
        },
        count: 10,
        dryRun: true,
        notifications: {
          channels: [],
        },
        cover: {
          enabled: true,
          provider: "dashscope",
          model: "wanx-poster-generation-v1",
        },
        bodyImages: {
          mode: "off",
          provider: "dashscope",
          count: 1,
          size: "1024*1024",
        },
        deduplication: {
          enabled: false,
          embeddingProvider: "dashscope",
          vectorStore: "sqlite",
        },
      },
    },
  };
}
