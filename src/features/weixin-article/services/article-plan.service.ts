import type { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import type { LLMProvider } from "@src/core/ports/llm.ts";
import {
  ArticleBodyImagePlan,
  ArticleCoverDirection,
  ArticlePlan,
  ArticlePlanFormat,
  ArticlePlanSection,
  ArticleRiskNote,
  ArticleTitleDirection,
} from "@src/features/weixin-article/domain/article-plan.ts";
import type { EditorialDecision } from "@src/features/weixin-article/domain/editorial-decision.ts";
import type { EvidencePack } from "@src/features/weixin-article/domain/evidence.ts";
import type { EditorialTopicReport } from "@src/features/weixin-article/domain/editorial-topic.ts";
import {
  getArticlePlanSystemPrompt,
  getArticlePlanUserPrompt,
  isArticlePlanFormat,
} from "@src/prompts/article-plan.prompt.ts";
import type { PromptProfileName } from "@src/prompts/prompt-profile.ts";
import { createStructuredJsonCompletion } from "@src/utils/llm-structured-output.ts";
import { Logger } from "@zilla/logger";

const logger = new Logger("weixin-article-plan-service");

interface RawArticlePlan {
  format?: unknown;
  thesis?: unknown;
  targetReader?: unknown;
  summary?: unknown;
  sections?: unknown;
  titleDirections?: unknown;
  coverDirection?: unknown;
  bodyImagePlan?: unknown;
  riskNotes?: unknown;
}

export class WeixinArticlePlanService {
  constructor(
    private readonly llm: LLMProvider,
    private readonly promptProfile?: PromptProfileName,
  ) {}

  async createArticlePlan(
    topicReport: EditorialTopicReport,
    contents: ScrapedContent[],
    decision?: EditorialDecision,
    evidencePack?: EvidencePack,
  ): Promise<ArticlePlan> {
    if (!contents.length) {
      return createFallbackArticlePlan(
        topicReport,
        contents,
        undefined,
        decision,
      );
    }

    try {
      const messages = [
        {
          role: "system" as const,
          content: getArticlePlanSystemPrompt(this.promptProfile),
        },
        {
          role: "user" as const,
          content: getArticlePlanUserPrompt(
            topicReport,
            contents,
            this.promptProfile,
            decision,
            evidencePack,
          ),
        },
      ];
      return await createStructuredJsonCompletion<RawArticlePlan, ArticlePlan>({
        label: "文章计划",
        llm: this.llm,
        messages,
        chatOptions: {
          temperature: 0.35,
          max_tokens: 3600,
          response_format: { type: "json_object" },
        },
        maxAttempts: 3,
        normalize: (raw) =>
          normalizeArticlePlan(
            raw,
            topicReport,
            contents,
            false,
            undefined,
            decision,
            evidencePack,
          ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[文章计划] AI 生成失败，使用本地兜底: ${message}`);
      return createFallbackArticlePlan(
        topicReport,
        contents,
        message,
        decision,
        evidencePack,
      );
    }
  }
}

export function normalizeArticlePlan(
  raw: RawArticlePlan,
  topicReport: EditorialTopicReport,
  contents: ScrapedContent[],
  fallback: boolean,
  error?: string,
  decision?: EditorialDecision,
  evidencePack?: EvidencePack,
): ArticlePlan {
  const validArticleIds = new Set(contents.map((content) => content.id));
  const sourceArticleIds = new Set<string>();
  const format = normalizeFormat(raw.format);
  const sections = normalizeSections(raw.sections, validArticleIds);
  for (const section of sections) {
    section.articleIds.forEach((id) => sourceArticleIds.add(id));
  }

  if (!sections.length) {
    throw new Error("文章计划缺少有效章节");
  }

  const coverDirection = normalizeCoverDirection(raw.coverDirection);
  const bodyImagePlan = normalizeBodyImagePlan(
    raw.bodyImagePlan,
    new Set(sections.map((section) => section.id)),
  );
  const riskNotes = normalizeRiskNotes(raw.riskNotes);

  return {
    generatedAt: new Date().toISOString(),
    fallback,
    error,
    format,
    thesis: stringValue(raw.thesis) ?? decision?.decisionSummary ??
      inferThesis(topicReport, contents),
    targetReader: stringValue(raw.targetReader) ?? "关注本领域趋势的读者",
    summary: stringValue(raw.summary) ?? evidencePack?.items.slice(0, 3)
      .map((item) => item.title)
      .join("；") ??
      decision?.whyThisNow.join("；") ??
      "基于今日选题生成的文章计划。",
    sections,
    titleDirections: normalizeTitleDirections(raw.titleDirections, contents),
    coverDirection,
    bodyImagePlan,
    riskNotes,
    sourceArticleIds: [...sourceArticleIds],
  };
}

function createFallbackArticlePlan(
  topicReport: EditorialTopicReport,
  contents: ScrapedContent[],
  error?: string,
  decision?: EditorialDecision,
  evidencePack?: EvidencePack,
): ArticlePlan {
  const leadTopicIds = decision?.selectedTopics.map((topic) => topic.topicId) ??
    [];
  const leadScores = [...topicReport.scores]
    .sort((left, right) => right.finalScore - left.finalScore)
    .sort((left, right) =>
      Number(leadTopicIds.includes(right.topicId)) -
      Number(leadTopicIds.includes(left.topicId))
    )
    .slice(0, 4);
  const clustersById = new Map(
    topicReport.clusters.map((cluster) => [cluster.id, cluster]),
  );
  const fallbackSections = leadScores.flatMap((score, index) => {
    const cluster = clustersById.get(score.topicId);
    if (!cluster) return [];
    return [{
      id: `section-${index + 1}`,
      title: cluster.title,
      intent: score.recommendedUse === "lead"
        ? "作为文章主线展开"
        : "作为补充信息简要说明",
      angle: score.reason,
      articleIds: cluster.articleIds.filter((id) =>
        contents.some((content) => content.id === id)
      ),
      keyPoints: [
        cluster.summary,
        ...cluster.keywords.slice(0, 3).map((keyword) => `关键词：${keyword}`),
      ].filter(Boolean),
    }];
  });
  const sections = fallbackSections.length
    ? fallbackSections
    : contents.slice(0, 4).map((content, index) => ({
      id: `section-${index + 1}`,
      title: content.title || `章节 ${index + 1}`,
      intent: "保留为基础信息",
      angle: "本地兜底计划：按文章排序组织内容。",
      articleIds: [content.id],
      keyPoints: [content.content.slice(0, 160)],
    }));
  const firstTitle = sections[0]?.title ?? contents[0]?.title ?? "今日内容";

  return {
    generatedAt: new Date().toISOString(),
    fallback: true,
    error,
    format: decision?.recommendedFormat ??
      (sections.length > 3 ? "daily-brief" : "mixed"),
    thesis: decision?.decisionSummary ?? inferThesis(topicReport, contents),
    targetReader: "关注本领域趋势的读者",
    summary: evidencePack?.items.length
      ? `结合 ${evidencePack.items.length} 条补充证据兜底组织正文：${
        evidencePack.items.slice(0, 3).map((item) => item.title).join("；")
      }`
      : decision
      ? `依据编辑决策兜底组织正文：${decision.decisionSummary}`
      : "AI 文章计划生成失败，已使用本地兜底计划组织正文结构。",
    sections,
    titleDirections: [
      {
        title: firstTitle,
        angle: "突出最重要主题",
        reason: "使用最高优先级主题作为标题方向。",
      },
      {
        title: "今天值得关注的几个变化",
        angle: "适合多主题速览",
        reason: "当主题分散时，保持标题稳健。",
      },
    ],
    coverDirection: {
      visualBrief: `围绕“${firstTitle}”生成克制、清晰的信息图式封面。`,
      textBrief: firstTitle,
      mood: "清晰、专业、少装饰",
    },
    bodyImagePlan: {
      enabled: false,
      placements: [],
    },
    riskNotes: [{
      level: "medium",
      issue: decision?.duplicationRisk.reason ??
        "文章计划使用本地兜底生成，缺少更细的编辑判断。",
      handling: decision?.writingDirectives[0] ??
        "正文生成时保持事实边界，避免额外扩展结论。",
    }],
    sourceArticleIds: [
      ...new Set(sections.flatMap((section) => section.articleIds)),
    ],
  };
}

function normalizeFormat(value: unknown): ArticlePlanFormat {
  if (typeof value === "string" && isArticlePlanFormat(value)) return value;
  return "mixed";
}

function normalizeSections(
  value: unknown,
  validArticleIds: Set<string>,
): ArticlePlanSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const articleIds = stringArray(record.articleIds)
      .filter((id) => validArticleIds.has(id));
    if (!articleIds.length) return [];
    return [{
      id: stringValue(record.id) ?? `section-${index + 1}`,
      title: stringValue(record.title) ?? `章节 ${index + 1}`,
      intent: stringValue(record.intent) ?? "说明该主题的核心信息",
      angle: stringValue(record.angle) ?? "按事实和影响组织内容",
      articleIds,
      keyPoints: stringArray(record.keyPoints).slice(0, 6),
    }];
  });
}

function normalizeTitleDirections(
  value: unknown,
  contents: ScrapedContent[],
): ArticleTitleDirection[] {
  const directions = Array.isArray(value)
    ? value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const title = stringValue(record.title);
      if (!title) return [];
      return [{
        title,
        angle: stringValue(record.angle) ?? "标题方向",
        reason: stringValue(record.reason) ?? "适合当前文章结构。",
      }];
    })
    : [];
  if (directions.length) return directions.slice(0, 5);
  return [{
    title: contents[0]?.title ?? "今日趋势观察",
    angle: "默认标题方向",
    reason: "AI 未提供标题方向，使用首篇文章标题兜底。",
  }];
}

function normalizeCoverDirection(value: unknown): ArticleCoverDirection {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      visualBrief: stringValue(record.visualBrief) ??
        "使用信息清晰、留白充足的专业封面。",
      textBrief: stringValue(record.textBrief) ?? "今日趋势",
      mood: stringValue(record.mood) ?? "专业、克制、清晰",
    };
  }
  return {
    visualBrief: "使用信息清晰、留白充足的专业封面。",
    textBrief: "今日趋势",
    mood: "专业、克制、清晰",
  };
}

function normalizeBodyImagePlan(
  value: unknown,
  sectionIds: Set<string>,
): ArticleBodyImagePlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: false, placements: [] };
  }
  const record = value as Record<string, unknown>;
  const placements = Array.isArray(record.placements)
    ? record.placements.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const placement = item as Record<string, unknown>;
      const sectionId = stringValue(placement.sectionId);
      if (!sectionId || !sectionIds.has(sectionId)) return [];
      return [{
        sectionId,
        purpose: stringValue(placement.purpose) ?? "辅助理解该章节",
        promptHint: stringValue(placement.promptHint) ?? "",
      }];
    })
    : [];
  return {
    enabled: booleanValue(record.enabled) ?? placements.length > 0,
    placements,
  };
}

function normalizeRiskNotes(value: unknown): ArticleRiskNote[] {
  if (!Array.isArray(value)) {
    return [{
      level: "low",
      issue: "未识别到明确风险。",
      handling: "正文保持事实来源和谨慎表述。",
    }];
  }
  const notes = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const issue = stringValue(record.issue);
    if (!issue) return [];
    return [{
      level: riskLevel(record.level),
      issue,
      handling: stringValue(record.handling) ?? "正文中谨慎表述。",
    }];
  });
  return notes.length ? notes.slice(0, 6) : [{
    level: "low",
    issue: "未识别到明确风险。",
    handling: "正文保持事实来源和谨慎表述。",
  }];
}

function inferThesis(
  topicReport: EditorialTopicReport,
  contents: ScrapedContent[],
): string {
  const topScore =
    [...topicReport.scores].sort((left, right) =>
      right.finalScore - left.finalScore
    )[0];
  const topCluster = topicReport.clusters.find((cluster) =>
    cluster.id === topScore?.topicId
  );
  if (topCluster) {
    return `本期主线围绕“${topCluster.title}”展开，说明其变化、影响和需要谨慎判断的部分。`;
  }
  return contents[0]?.title
    ? `本期围绕“${contents[0].title}”梳理关键信息。`
    : "本期围绕已抓取内容梳理关键信息。";
}

function riskLevel(value: unknown): ArticleRiskNote["level"] {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "low";
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = stringValue(item);
    return text ? [text] : [];
  });
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
