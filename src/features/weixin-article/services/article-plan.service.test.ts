import { assertEquals, assertThrows } from "@std/assert";
import type { LLMProvider } from "@src/core/ports/llm.ts";
import type { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import type { EditorialDecision } from "@src/features/weixin-article/domain/editorial-decision.ts";
import type { EditorialTopicReport } from "@src/features/weixin-article/domain/editorial-topic.ts";
import {
  normalizeArticlePlan,
  WeixinArticlePlanService,
} from "@src/features/weixin-article/services/article-plan.service.ts";

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
    title: "API 成本下降",
    content: "同一轮模型更新带来 API 成本下降。",
    url: "https://example.com/a2",
    publishDate: "2026-05-23",
    metadata: {},
  },
];

const topicReport: EditorialTopicReport = {
  generatedAt: "2026-05-23T00:00:00.000Z",
  fallback: false,
  clusters: [{
    id: "topic-openai",
    title: "OpenAI 模型更新影响开发者成本",
    summary: "模型能力和 API 价格构成同一主题。",
    keywords: ["OpenAI", "API"],
    articleIds: ["a1", "a2"],
    primaryArticleId: "a1",
    sourceCount: 2,
    freshness: 90,
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
    reason: "影响开发者成本和产品选择。",
    recommendedUse: "lead",
  }],
};

const editorialDecision: EditorialDecision = {
  generatedAt: "2026-05-23T00:00:00.000Z",
  fallback: false,
  leadTopicId: "topic-openai",
  leadTopicTitle: "OpenAI 模型更新影响开发者成本",
  decisionSummary: "今天写模型更新，因为它同时影响能力和成本。",
  whyThisNow: ["新模型发布", "API 成本下降"],
  selectedTopics: [{
    topicId: "topic-openai",
    role: "lead",
    reason: "证据和读者价值都较高。",
  }],
  skippedTopics: [],
  duplicationRisk: {
    level: "low",
    reason: "近期没有同角度内容。",
    avoidAngles: ["避免空泛标题"],
  },
  sourceJudgements: [{
    url: "https://example.com/a1",
    role: "primary",
    reason: "信息量最高。",
  }],
  recommendedFormat: "deep-analysis",
  writingDirectives: ["先讲变化，再讲影响。"],
  titleWarnings: ["不要写成行业巨变。"],
};

function createService(content: string): WeixinArticlePlanService {
  const llm: LLMProvider = {
    initialize: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    setModel: () => {},
    createChatCompletion: () =>
      Promise.resolve({
        choices: [{ message: { content } }],
      }),
  };
  return new WeixinArticlePlanService(llm);
}

Deno.test("article plan service returns normalized AI plan", async () => {
  const service = createService(JSON.stringify({
    format: "deep-analysis",
    thesis: "OpenAI 的模型更新正在改变开发者成本结构。",
    targetReader: "AI 应用开发者",
    summary: "围绕模型能力、成本和风险组织正文。",
    sections: [{
      id: "section-1",
      title: "模型更新带来的直接变化",
      intent: "解释发生了什么",
      angle: "先讲能力，再讲成本",
      articleIds: ["a1", "a2", "missing"],
      keyPoints: ["延迟降低", "API 成本下降"],
    }],
    titleDirections: [{
      title: "OpenAI 新模型之后，开发者成本会怎么变",
      angle: "成本影响",
      reason: "贴近开发者决策。",
    }],
    coverDirection: {
      visualBrief: "抽象 API 控制台和成本曲线",
      textBrief: "模型更新与成本变化",
      mood: "专业、克制",
    },
    bodyImagePlan: {
      enabled: true,
      placements: [{
        sectionId: "section-1",
        purpose: "解释成本变化",
        promptHint: "API 调用成本曲线",
      }],
    },
    riskNotes: [{
      level: "medium",
      issue: "成本信息可能随区域和套餐变化。",
      handling: "正文中避免写成绝对结论。",
    }],
  }));

  const plan = await service.createArticlePlan(topicReport, contents);

  assertEquals(plan.fallback, false);
  assertEquals(plan.format, "deep-analysis");
  assertEquals(plan.sections[0].articleIds, ["a1", "a2"]);
  assertEquals(plan.bodyImagePlan.enabled, true);
  assertEquals(plan.riskNotes[0].level, "medium");
});

Deno.test("article plan service falls back when LLM output is invalid", async () => {
  const service = createService("not json");

  const plan = await service.createArticlePlan(topicReport, contents);

  assertEquals(plan.fallback, true);
  assertEquals(plan.sections.length, 1);
  assertEquals(plan.sourceArticleIds, ["a1", "a2"]);
});

Deno.test("article plan fallback uses editorial decision", async () => {
  const service = createService("not json");

  const plan = await service.createArticlePlan(
    topicReport,
    contents,
    editorialDecision,
  );

  assertEquals(plan.format, "deep-analysis");
  assertEquals(plan.thesis, editorialDecision.decisionSummary);
  assertEquals(plan.riskNotes[0].handling, "先讲变化，再讲影响。");
});

Deno.test("normalizeArticlePlan rejects plans without valid sections", () => {
  assertThrows(
    () =>
      normalizeArticlePlan(
        {
          sections: [{
            id: "section-1",
            title: "无效章节",
            articleIds: ["missing"],
          }],
        },
        topicReport,
        contents,
        false,
      ),
    Error,
    "文章计划缺少有效章节",
  );
});
