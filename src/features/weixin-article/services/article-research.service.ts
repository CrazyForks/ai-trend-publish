import type { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import type { EditorialDecision } from "@src/features/weixin-article/domain/editorial-decision.ts";
import type { EditorialTopicReport } from "@src/features/weixin-article/domain/editorial-topic.ts";
import type {
  EvidenceItem,
  EvidencePack,
  EvidenceSourceType,
} from "@src/features/weixin-article/domain/evidence.ts";
import type {
  ArticleContentFetcher,
  ArticleContentFetchFailure,
} from "@src/features/weixin-article/services/content-scrape.service.ts";
import { Logger } from "@zilla/logger";

const logger = new Logger("weixin-article-research-service");

export interface ArticleResearchConfig {
  enabled: boolean;
  maxResearchQueries: number;
  maxResultsPerQuery: number;
  searchProviders: string[];
}

export class WeixinArticleResearchService {
  constructor(
    private readonly contentFetcher: ArticleContentFetcher,
    private readonly config: ArticleResearchConfig,
  ) {}

  async createEvidencePack(input: {
    topicReport: EditorialTopicReport;
    editorialDecision: EditorialDecision;
    contents: ScrapedContent[];
  }): Promise<EvidencePack> {
    const topic = input.editorialDecision.leadTopicTitle ||
      input.topicReport.clusters[0]?.title ||
      "未命名选题";

    if (!this.config.enabled) {
      return createEmptyEvidencePack(topic, "未配置搜索能力，跳过补充证据");
    }

    const queries = this.createQueries(input).slice(
      0,
      normalizeLimit(this.config.maxResearchQueries, 3, 6),
    );
    const resultLimit = normalizeLimit(this.config.maxResultsPerQuery, 3, 8);
    const items: EvidenceItem[] = [];
    const gaps: string[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      const failures: ArticleContentFetchFailure[] = [];
      try {
        const result = await this.contentFetcher.scrape(
          {
            raw: `search:${query}`,
            url: query,
            kind: "query",
            group: "search",
            providers: this.config.searchProviders,
          },
          (failure) => {
            failures.push(failure);
          },
        );
        const candidates = result.contents.slice(0, resultLimit);
        if (!candidates.length) {
          gaps.push(`搜索无结果: ${query}`);
          continue;
        }

        for (const candidate of candidates) {
          const hydrated = await this.hydrateCandidate(candidate);
          if (seenUrls.has(hydrated.url)) continue;
          seenUrls.add(hydrated.url);
          items.push(this.toEvidenceItem(hydrated, query));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failureMessage = failures.length
          ? `${message}; ${
            failures.map((item) => `${item.provider}: ${item.message}`).join(
              "; ",
            )
          }`
          : message;
        logger.warn(`[补充研究] 搜索失败: ${query} - ${failureMessage}`);
        gaps.push(`搜索失败: ${query} - ${failureMessage}`);
      }
    }

    const filteredItems = filterEvidenceItems(items);
    return {
      topic,
      generatedAt: new Date().toISOString(),
      queries,
      items: filteredItems.slice(0, queries.length * resultLimit),
      gaps,
      skippedReason: filteredItems.length ? undefined : "未获得可用补充证据",
    };
  }

  private createQueries(input: {
    topicReport: EditorialTopicReport;
    editorialDecision: EditorialDecision;
    contents: ScrapedContent[];
  }): string[] {
    const clusterTitleById = new Map(
      input.topicReport.clusters.map((cluster) => [cluster.id, cluster.title]),
    );
    const sourceHosts = [
      ...new Set(
        input.contents.map((content) => readHost(content.url)).filter(
          Boolean,
        ),
      ),
    ].slice(0, 3);
    const values = [
      ...input.contents.slice(0, 3).map((content) =>
        `${content.title} ${sourceHosts[0] ?? ""}`
      ),
      input.editorialDecision.leadTopicTitle,
      `${input.editorialDecision.leadTopicTitle} ${
        sourceHosts.length ? sourceHosts.join(" ") : "official announcement"
      }`,
      ...input.editorialDecision.selectedTopics.map((topic) =>
        clusterTitleById.get(topic.topicId)
      ),
      ...input.topicReport.clusters.flatMap((cluster) => [
        cluster.title,
        cluster.keywords.slice(0, 3).join(" "),
      ]),
    ];

    const seen = new Set<string>();
    return values
      .map((value) => value?.replace(/\s+/g, " ").trim())
      .filter((value): value is string => Boolean(value && value.length >= 2))
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private async hydrateCandidate(
    candidate: ScrapedContent,
  ): Promise<ScrapedContent> {
    if (!this.contentFetcher.hydrate) return candidate;
    try {
      const result = await this.contentFetcher.hydrate(candidate, (failure) => {
        logger.debug(
          `[补充研究] 证据深抓失败 ${candidate.url}: ${failure.provider} ${failure.message}`,
        );
      });
      return result.content;
    } catch (error) {
      logger.debug(
        `[补充研究] 证据深抓异常 ${candidate.url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return candidate;
    }
  }

  private toEvidenceItem(content: ScrapedContent, query: string): EvidenceItem {
    const sourceType = inferSourceType(content.url);
    return {
      id: `ev_${stableHash(`${query}:${content.url}`)}`,
      title: content.title || content.url,
      url: content.url,
      provider: String(
        content.metadata.provider ?? content.metadata.source ?? "unknown",
      ),
      sourceType,
      summary: normalizeSummary(content.content),
      supports: [query],
      confidence: inferConfidence(sourceType),
    };
  }
}

function createEmptyEvidencePack(
  topic: string,
  skippedReason: string,
): EvidencePack {
  return {
    topic,
    generatedAt: new Date().toISOString(),
    queries: [],
    items: [],
    gaps: [],
    skippedReason,
  };
}

function inferSourceType(url: string): EvidenceSourceType {
  const host = readHost(url);
  if (!host) return "background";
  if (
    host.endsWith(".gov") ||
    host.endsWith(".edu") ||
    host.includes("openai.com") ||
    host.includes("anthropic.com") ||
    host.includes("deepmind.google") ||
    host.includes("research.google") ||
    host.includes("blog.google") ||
    host.includes("googleblog.com") ||
    host.includes("microsoft.com") ||
    host.includes("github.com")
  ) {
    return "official";
  }
  if (
    host.includes("arxiv.org") ||
    host.includes("paperswithcode.com") ||
    host.includes("huggingface.co") ||
    host.includes("pmc.ncbi.nlm.nih.gov")
  ) {
    return "primary";
  }
  if (
    host.includes("x.com") ||
    host.includes("twitter.com") ||
    host.includes("reddit.com") ||
    host.includes("news.ycombinator.com")
  ) {
    return "community";
  }
  if (
    host.includes("techcrunch.com") ||
    host.includes("theverge.com") ||
    host.includes("wired.com") ||
    host.includes("36kr.com") ||
    host.includes("qbitai.com")
  ) {
    return "media";
  }
  return "background";
}

function inferConfidence(sourceType: EvidenceSourceType): EvidenceItem[
  "confidence"
] {
  if (sourceType === "official" || sourceType === "primary") return "high";
  if (sourceType === "media" || sourceType === "community") return "medium";
  return "low";
}

function filterEvidenceItems(items: EvidenceItem[]): EvidenceItem[] {
  return items.filter((item) => {
    if (item.summary.trim().length < 120) return false;
    if (item.confidence === "low" && item.sourceType === "background") {
      return false;
    }
    return true;
  });
}

function normalizeSummary(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 900);
}

function readHost(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function normalizeLimit(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function stableHash(value: string): string {
  let result = 0;
  for (let index = 0; index < value.length; index++) {
    result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result).toString(36);
}
