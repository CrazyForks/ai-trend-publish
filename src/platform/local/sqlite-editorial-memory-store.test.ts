import { assertEquals } from "@std/assert";
import { SQLiteEditorialMemoryStore } from "@src/platform/local/sqlite-editorial-memory-store.ts";

Deno.test("SQLiteEditorialMemoryStore records article memory and source performance", async () => {
  const store = new SQLiteEditorialMemoryStore(":memory:");

  await store.recordArticle({
    runId: "run-1",
    profileId: "profile-1",
    title: "今日 AI 主线",
    thesis: "模型能力正在进入产品交付阶段",
    keywords: ["AI", "产品"],
    topicTitles: ["模型产品化"],
    sourceUrls: ["https://example.com/a"],
    qualityScore: 86,
    publishStatus: "draft",
    dryRun: true,
    createdAt: "2026-05-23T00:00:00.000Z",
  });

  await store.recordSourceHealth("run-1", {
    generatedAt: "2026-05-23T00:01:00.000Z",
    records: [
      {
        url: "https://example.com/a",
        group: "default",
        status: "succeeded",
        selectedProvider: "firecrawl",
        articleCount: 2,
        failures: [],
      },
      {
        url: "https://example.com/b",
        group: "web",
        status: "failed",
        articleCount: 0,
        failures: [{ provider: "jina", message: "timeout" }],
      },
    ],
  });
  await store.recordSourceHealth("run-2", {
    generatedAt: "2026-05-23T00:02:00.000Z",
    records: [
      {
        url: "https://example.com/a",
        group: "default",
        status: "empty",
        articleCount: 0,
        failures: [],
      },
    ],
  });

  const context = await store.getContext({ profileId: "profile-1" });

  assertEquals(context.recentArticles.length, 1);
  assertEquals(context.recentArticles[0].title, "今日 AI 主线");
  assertEquals(context.recentArticles[0].keywords, ["AI", "产品"]);
  assertEquals(context.sourcePerformance.length, 2);
  const sourceA = context.sourcePerformance.find((item) =>
    item.url === "https://example.com/a"
  );
  assertEquals(sourceA?.runs, 2);
  assertEquals(sourceA?.successes, 1);
  assertEquals(sourceA?.empty, 1);
  assertEquals(sourceA?.totalArticles, 2);

  const feedback = await store.saveFeedback({
    runId: "run-1",
    profileId: "profile-1",
    rating: "good",
    note: "主题具体，证据充分",
  });
  assertEquals(feedback.rating, "good");
  assertEquals((await store.getFeedback("run-1"))?.note, "主题具体，证据充分");

  const contextWithFeedback = await store.getContext({
    profileId: "profile-1",
  });
  assertEquals(contextWithFeedback.recentFeedback.length, 1);
  assertEquals(contextWithFeedback.recentFeedback[0].rating, "good");

  assertEquals(await store.deleteFeedback("run-1"), true);
  assertEquals(await store.getFeedback("run-1"), null);
});
