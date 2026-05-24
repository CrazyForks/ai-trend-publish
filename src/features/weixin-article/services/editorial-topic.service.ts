import type { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import type { EditorialMemoryContext } from "@src/core/ports/editorial-memory-store.ts";
import type { LLMProvider } from "@src/core/ports/llm.ts";
import {
  EditorialTopicReport,
  TopicCluster,
  TopicRecommendation,
  TopicScore,
} from "@src/features/weixin-article/domain/editorial-topic.ts";
import {
  getEditorialTopicSystemPrompt,
  getEditorialTopicUserPrompt,
} from "@src/prompts/editorial-topic.prompt.ts";
import type { PromptProfileName } from "@src/prompts/prompt-profile.ts";
import { createStructuredJsonCompletion } from "@src/utils/llm-structured-output.ts";
import { Logger } from "@zilla/logger";

const logger = new Logger("weixin-editorial-topic-service");

interface RawTopicReport {
  clusters?: unknown;
  scores?: unknown;
}

export class WeixinArticleEditorialTopicService {
  constructor(
    private readonly llm: LLMProvider,
    private readonly promptProfile?: PromptProfileName,
    private readonly maxTopics = 8,
  ) {}

  async createTopicReport(
    contents: ScrapedContent[],
    memory?: EditorialMemoryContext,
  ): Promise<EditorialTopicReport> {
    if (!contents.length) {
      return {
        generatedAt: new Date().toISOString(),
        fallback: false,
        clusters: [],
        scores: [],
      };
    }

    try {
      const messages = [
        {
          role: "system" as const,
          content: getEditorialTopicSystemPrompt(this.promptProfile),
        },
        {
          role: "user" as const,
          content: getEditorialTopicUserPrompt(
            contents,
            this.maxTopics,
            memory,
          ),
        },
      ];
      return await createStructuredJsonCompletion<
        RawTopicReport,
        EditorialTopicReport
      >({
        label: "选题聚类",
        llm: this.llm,
        messages,
        chatOptions: {
          temperature: 0.35,
          response_format: { type: "json_object" },
        },
        maxAttempts: 3,
        normalize: (raw) => normalizeTopicReport(raw, contents, false),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[选题聚类] AI 生成失败，使用本地兜底: ${message}`);
      return createFallbackTopicReport(contents, this.maxTopics, message);
    }
  }
}

export function normalizeTopicReport(
  raw: RawTopicReport,
  contents: ScrapedContent[],
  fallback: boolean,
  error?: string,
): EditorialTopicReport {
  const contentById = new Map(contents.map((content) => [content.id, content]));
  const clusters = Array.isArray(raw.clusters)
    ? raw.clusters.flatMap((item, index) => {
      const cluster = normalizeCluster(item, index, contentById);
      return cluster ? [cluster] : [];
    })
    : [];
  const clusterIds = new Set(clusters.map((cluster) => cluster.id));
  const scores = Array.isArray(raw.scores)
    ? raw.scores.flatMap((item) => {
      const score = normalizeScore(item, clusterIds);
      return score ? [score] : [];
    })
    : [];
  const scoredIds = new Set(scores.map((score) => score.topicId));

  for (const cluster of clusters) {
    if (!scoredIds.has(cluster.id)) {
      scores.push(createDefaultScore(cluster));
    }
  }

  if (!clusters.length) {
    throw new Error("主题聚类结果为空");
  }

  scores.sort((a, b) => b.finalScore - a.finalScore);

  return {
    generatedAt: new Date().toISOString(),
    fallback,
    error,
    clusters,
    scores,
  };
}

function normalizeCluster(
  value: unknown,
  index: number,
  contentById: Map<string, ScrapedContent>,
): TopicCluster | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const articleIds = stringArray(record.articleIds)
    .filter((id) => contentById.has(id));
  if (!articleIds.length) return null;

  const primaryArticleId = stringValue(record.primaryArticleId);
  const primary = primaryArticleId && articleIds.includes(primaryArticleId)
    ? primaryArticleId
    : articleIds[0];
  const primaryContent = contentById.get(primary);

  return {
    id: stringValue(record.id) ?? `topic-${index + 1}`,
    title: stringValue(record.title) ?? primaryContent?.title ?? "未命名主题",
    summary: stringValue(record.summary) ??
      primaryContent?.content.slice(0, 160) ?? "",
    keywords: stringArray(record.keywords).slice(0, 8),
    articleIds,
    primaryArticleId: primary,
    sourceCount: integerValue(record.sourceCount) ?? articleIds.length,
    freshness: clampScore(record.freshness, 60),
    confidence: clampScore(record.confidence, 70),
  };
}

function normalizeScore(
  value: unknown,
  clusterIds: Set<string>,
): TopicScore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const topicId = stringValue(record.topicId);
  if (!topicId || !clusterIds.has(topicId)) return null;
  return {
    topicId,
    novelty: clampScore(record.novelty, 60),
    relevance: clampScore(record.relevance, 60),
    impact: clampScore(record.impact, 60),
    evidence: clampScore(record.evidence, 60),
    actionability: clampScore(record.actionability, 50),
    saturation: clampScore(record.saturation, 30),
    risk: clampScore(record.risk, 20),
    finalScore: clampScore(record.finalScore, 60),
    reason: stringValue(record.reason) ?? "主题具备基础编辑价值。",
    recommendedUse: readRecommendation(record.recommendedUse),
  };
}

function createFallbackTopicReport(
  contents: ScrapedContent[],
  maxTopics: number,
  error: string,
): EditorialTopicReport {
  const clusters = contents.slice(0, maxTopics).map((content, index) => ({
    id: `topic-${index + 1}`,
    title: content.title || `候选主题 ${index + 1}`,
    summary: content.content.slice(0, 180),
    keywords: readMetadataKeywords(content.metadata),
    articleIds: [content.id],
    primaryArticleId: content.id,
    sourceCount: 1,
    freshness: 50,
    confidence: 45,
  }));
  return {
    generatedAt: new Date().toISOString(),
    fallback: true,
    error,
    clusters,
    scores: clusters.map(createDefaultScore),
  };
}

function createDefaultScore(cluster: TopicCluster): TopicScore {
  const sourceBonus = Math.min(cluster.sourceCount * 4, 16);
  const confidence = Math.round((cluster.confidence + cluster.freshness) / 2);
  const finalScore = clampScore(confidence + sourceBonus, 55);
  return {
    topicId: cluster.id,
    novelty: cluster.freshness,
    relevance: 60,
    impact: 55,
    evidence: cluster.confidence,
    actionability: 50,
    saturation: 35,
    risk: 25,
    finalScore,
    reason: "本地兜底评分：基于主题新鲜度、置信度和来源数量估算。",
    recommendedUse: finalScore >= 75
      ? "lead"
      : finalScore >= 55
      ? "brief"
      : "watch",
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    ).map((item) => item.trim())
    : [];
}

function integerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : undefined;
}

function clampScore(value: unknown, fallback: number): number {
  const number = typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
  return Math.max(0, Math.min(100, Math.round(number * 10) / 10));
}

function readRecommendation(value: unknown): TopicRecommendation {
  return value === "lead" || value === "brief" || value === "skip" ||
      value === "watch"
    ? value
    : "watch";
}

function readMetadataKeywords(metadata: Record<string, unknown>): string[] {
  const value = metadata.keywords;
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .slice(0, 6);
  }
  return [];
}
