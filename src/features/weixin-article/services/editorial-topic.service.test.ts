import { assertEquals } from "@std/assert";
import type { LLMProvider } from "@src/core/ports/llm.ts";
import type { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import {
  normalizeTopicReport,
  WeixinArticleEditorialTopicService,
} from "@src/features/weixin-article/services/editorial-topic.service.ts";

const contents: ScrapedContent[] = [
  {
    id: "a1",
    title: "OpenAI 发布新模型",
    content: "OpenAI 发布新模型，面向开发者提供更低延迟。",
    url: "https://example.com/a1",
    publishDate: "2026-05-23",
    metadata: { keywords: ["OpenAI", "模型"] },
  },
  {
    id: "a2",
    title: "新模型 API 降价",
    content: "同一轮模型更新带来 API 成本下降。",
    url: "https://example.com/a2",
    publishDate: "2026-05-23",
    metadata: {},
  },
];

function createService(content: string): WeixinArticleEditorialTopicService {
  const llm: LLMProvider = {
    initialize: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    setModel: () => {},
    createChatCompletion: () =>
      Promise.resolve({
        choices: [{ message: { content } }],
      }),
  };
  return new WeixinArticleEditorialTopicService(llm);
}

Deno.test("editorial topic service returns normalized AI report", async () => {
  const service = createService(JSON.stringify({
    clusters: [{
      id: "topic-openai",
      title: "OpenAI 模型更新影响开发者成本",
      summary: "OpenAI 新模型和 API 降价构成同一主题。",
      keywords: ["OpenAI", "API"],
      articleIds: ["a1", "a2", "missing"],
      primaryArticleId: "a1",
      sourceCount: 2,
      freshness: 91,
      confidence: 88,
    }],
    scores: [{
      topicId: "topic-openai",
      novelty: 90,
      relevance: 92,
      impact: 86,
      evidence: 88,
      actionability: 80,
      saturation: 20,
      risk: 15,
      finalScore: 89,
      reason: "新模型和价格变化都影响开发者。",
      recommendedUse: "lead",
    }],
  }));

  const report = await service.createTopicReport(contents);

  assertEquals(report.fallback, false);
  assertEquals(report.clusters[0].articleIds, ["a1", "a2"]);
  assertEquals(report.scores[0].recommendedUse, "lead");
});

Deno.test("editorial topic service passes editorial memory to prompt", async () => {
  let userPrompt = "";
  const llm: LLMProvider = {
    initialize: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    setModel: () => {},
    createChatCompletion: (messages) => {
      userPrompt = String(messages[1]?.content ?? "");
      return Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              clusters: [{
                id: "topic-1",
                title: "新主题",
                articleIds: ["a1"],
                primaryArticleId: "a1",
              }],
              scores: [],
            }),
          },
        }],
      });
    },
  };
  const service = new WeixinArticleEditorialTopicService(llm);

  await service.createTopicReport(contents, {
    recentArticles: [{
      runId: "run-1",
      title: "OpenAI 模型更新影响开发者成本",
      thesis: "模型价格下降",
      keywords: ["OpenAI"],
      topicTitles: ["模型更新"],
      sourceUrls: ["https://example.com/a1"],
      qualityScore: 86,
      publishStatus: "draft",
      dryRun: true,
      createdAt: "2026-05-22T00:00:00.000Z",
    }],
    sourcePerformance: [{
      url: "https://example.com/a1",
      group: "default",
      runs: 2,
      successes: 1,
      failures: 1,
      empty: 0,
      totalArticles: 3,
      lastStatus: "succeeded",
      updatedAt: "2026-05-23T00:00:00.000Z",
    }],
    recentFeedback: [{
      runId: "run-1",
      rating: "bad",
      note: "标题太泛，缺少具体读者收益",
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
    }],
  });

  assertEquals(userPrompt.includes("近期编辑记忆"), true);
  assertEquals(userPrompt.includes("OpenAI 模型更新影响开发者成本"), true);
  assertEquals(userPrompt.includes("标题太泛"), true);
  assertEquals(userPrompt.includes("来源表现摘要"), true);
});

Deno.test("editorial topic service falls back when LLM output is invalid", async () => {
  const service = createService("not json");

  const report = await service.createTopicReport(contents);

  assertEquals(report.fallback, true);
  assertEquals(report.clusters.length, 2);
  assertEquals(report.scores.length, 2);
});

Deno.test("normalizeTopicReport adds default scores for unscored clusters", () => {
  const report = normalizeTopicReport(
    {
      clusters: [{
        id: "topic-1",
        title: "主题",
        articleIds: ["a1"],
        primaryArticleId: "a1",
      }],
      scores: [],
    },
    contents,
    false,
  );

  assertEquals(report.scores[0].topicId, "topic-1");
  assertEquals(report.scores[0].recommendedUse, "brief");
});
