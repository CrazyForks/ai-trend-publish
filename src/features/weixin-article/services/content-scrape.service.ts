import { ArticleSource } from "@src/features/weixin-article/domain/article-source.ts";
import { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import { INotifier } from "@src/core/ports/notifier.ts";
import { WorkflowTerminateError } from "@src/core/workflow/workflow-error.ts";
import { Logger } from "@zilla/logger";
import ProgressBar from "jsr:@deno-library/progress";
import { WeixinArticleWorkflowStats } from "./workflow-stats.ts";

export type ArticleSourceFilter =
  | "all"
  | "firecrawl"
  | "jina"
  | "jina-search"
  | "brave-search"
  | "tavily-search"
  | "exa-search"
  | "serper-search"
  | "newsapi"
  | "gdelt"
  | "hackernews"
  | "arxiv"
  | "twitter"
  | "rss";

export interface WeixinArticleSourceLoadResult {
  sources: ArticleSource[];
  totalSources: number;
}

export interface ArticleContentFetchFailure {
  provider: string;
  message: string;
}

export interface ArticleContentFetchResult {
  contents: ScrapedContent[];
  provider?: string;
  failures: ArticleContentFetchFailure[];
}

export interface ArticleContentHydrationResult {
  content: ScrapedContent;
  hydrated: boolean;
  provider?: string;
  failures: ArticleContentFetchFailure[];
  originalContentLength: number;
  hydratedContentLength: number;
}

export interface ArticleSourceHealthRecord {
  raw: string;
  url: string;
  group: string;
  providers: string[];
  status: "succeeded" | "failed" | "empty";
  selectedProvider?: string;
  originalArticleCount?: number;
  articleCount: number;
  filteredOldCount?: number;
  truncatedCount?: number;
  durationMs: number;
  failures: ArticleContentFetchFailure[];
}

export interface ArticleSourceHealthReport {
  generatedAt: string;
  totalSources: number;
  succeeded: number;
  failed: number;
  empty: number;
  totalArticles: number;
  records: ArticleSourceHealthRecord[];
}

export interface ArticleScrapeDetailedResult {
  contents: ScrapedContent[];
  health: ArticleSourceHealthReport;
}

interface ArticleSourceScrapeResult {
  contents: ScrapedContent[];
  record: ArticleSourceHealthRecord;
}

export interface ArticleContentFetcher {
  scrape(
    source: ArticleSource,
    onAttemptFailure?: (
      failure: ArticleContentFetchFailure,
    ) => Promise<void> | void,
  ): Promise<ArticleContentFetchResult>;

  hydrate?(
    content: ScrapedContent,
    onAttemptFailure?: (
      failure: ArticleContentFetchFailure,
    ) => Promise<void> | void,
  ): Promise<ArticleContentHydrationResult>;
}

export interface ArticleSourceLimits {
  maxAgeDays: number;
  maxItemsPerSource: number;
}

const logger = new Logger("weixin-article-scrape-service");
const DEFAULT_SOURCE_LIMITS: ArticleSourceLimits = {
  maxAgeDays: 14,
  maxItemsPerSource: 20,
};

export class WeixinArticleContentScrapeService {
  constructor(
    private readonly sources: ArticleSource[],
    private readonly notifier: INotifier,
    private readonly stats: WeixinArticleWorkflowStats,
    private readonly contentFetcher: ArticleContentFetcher,
    private readonly sourceLimits: Partial<ArticleSourceLimits> = {},
  ) {
  }

  async loadSources(
    sourceType: ArticleSourceFilter = "all",
  ): Promise<WeixinArticleSourceLoadResult> {
    let sources = [...this.sources];
    if (sourceType !== "all") {
      sources = sources.filter((source) =>
        source.providers.includes(sourceType)
      );
    }

    const totalSources = sources.length;
    if (totalSources === 0) {
      throw new WorkflowTerminateError("未配置任何数据源");
    }

    logger.info(`[数据源] 发现 ${totalSources} 个数据源`);
    return { sources, totalSources };
  }

  async scrapeAll(
    sourceLoadResult: WeixinArticleSourceLoadResult,
  ): Promise<ScrapedContent[]> {
    const result = await this.scrapeAllDetailed(sourceLoadResult);
    if (result.contents.length === 0) {
      throw new WorkflowTerminateError("未获取到任何内容，流程终止");
    }
    return result.contents;
  }

  async scrapeAllDetailed(
    sourceLoadResult: WeixinArticleSourceLoadResult,
  ): Promise<ArticleScrapeDetailedResult> {
    const contents: ScrapedContent[] = [];
    const records: ArticleSourceHealthRecord[] = [];
    const scrapeProgress = new ProgressBar({
      title: "内容抓取进度",
      total: sourceLoadResult.totalSources,
      clear: true,
      display: ":title | :percent | :completed/:total | :time \n",
    });
    let scrapeCompleted = 0;
    let totalArticles = 0;

    for (const source of sourceLoadResult.sources) {
      const sourceResult = await this.scrapeSource(source);
      const record = sourceResult.record;
      records.push(record);
      contents.push(...sourceResult.contents);
      totalArticles += record.articleCount;
      await scrapeProgress.render(++scrapeCompleted, {
        title:
          `抓取 ${source.group}: ${source.url} | 已获取文章: ${totalArticles}篇`,
      });
    }

    this.stats.contents = contents.length;
    return {
      contents,
      health: {
        generatedAt: new Date().toISOString(),
        totalSources: sourceLoadResult.totalSources,
        succeeded: records.filter((record) => record.status === "succeeded")
          .length,
        failed: records.filter((record) => record.status === "failed").length,
        empty: records.filter((record) => record.status === "empty").length,
        totalArticles,
        records,
      },
    };
  }

  private async scrapeSource(
    source: ArticleSource,
  ): Promise<ArticleSourceScrapeResult> {
    const startedAt = Date.now();
    logger.debug(
      `[${source.group}] 抓取: ${source.url}, providers=${
        source.providers.join(" -> ")
      }`,
    );

    const result = await this.contentFetcher.scrape(
      source,
      async (failure) => {
        logger.warn(
          `[${failure.provider}] ${source.url} 抓取失败，尝试下一个 provider: ${failure.message}`,
        );
      },
    );

    if (result.contents.length > 0) {
      const limited = applySourceLimits(
        result.contents,
        this.getSourceLimits(),
      );
      if (limited.filteredOldCount > 0 || limited.truncatedCount > 0) {
        logger.info(
          `[${result.provider}] ${source.url} 截断: 原始 ${result.contents.length} 篇，保留 ${limited.contents.length} 篇，旧内容 ${limited.filteredOldCount} 篇，超量 ${limited.truncatedCount} 篇`,
        );
      }

      if (limited.contents.length === 0) {
        logger.warn(
          `[${result.provider}] ${source.url} 抓取成功但过滤后为空: 原始 ${result.contents.length} 篇，旧内容 ${limited.filteredOldCount} 篇`,
        );
        return {
          contents: [],
          record: {
            raw: source.raw,
            url: source.url,
            group: source.group,
            providers: source.providers,
            status: "empty",
            selectedProvider: result.provider,
            originalArticleCount: result.contents.length,
            articleCount: 0,
            filteredOldCount: limited.filteredOldCount,
            truncatedCount: limited.truncatedCount,
            durationMs: Date.now() - startedAt,
            failures: result.failures,
          },
        };
      }

      this.stats.success++;
      logger.info(
        `[${result.provider}] ${source.url} 抓取成功: ${limited.contents.length} 篇`,
      );
      return {
        contents: limited.contents,
        record: {
          raw: source.raw,
          url: source.url,
          group: source.group,
          providers: source.providers,
          status: "succeeded",
          selectedProvider: result.provider,
          originalArticleCount: result.contents.length,
          articleCount: limited.contents.length,
          filteredOldCount: limited.filteredOldCount,
          truncatedCount: limited.truncatedCount,
          durationMs: Date.now() - startedAt,
          failures: result.failures,
        },
      };
    }

    this.stats.failed++;
    const message = result.failures
      .map((failure) => `${failure.provider}: ${failure.message}`)
      .join("\n");
    logger.error(`[${source.group}] ${source.url} 抓取失败:`, message);
    await this.notifier.warning(
      "数据源抓取失败",
      `源: ${source.url}\n分组: ${source.group}\n错误: ${message}`,
    );
    return {
      contents: [],
      record: {
        raw: source.raw,
        url: source.url,
        group: source.group,
        providers: source.providers,
        status: result.failures.length > 0 ? "failed" : "empty",
        articleCount: 0,
        durationMs: Date.now() - startedAt,
        failures: result.failures,
      },
    };
  }

  private getSourceLimits(): ArticleSourceLimits {
    return {
      maxAgeDays: normalizeLimit(
        this.sourceLimits.maxAgeDays,
        DEFAULT_SOURCE_LIMITS.maxAgeDays,
        365,
      ),
      maxItemsPerSource: normalizeLimit(
        this.sourceLimits.maxItemsPerSource,
        DEFAULT_SOURCE_LIMITS.maxItemsPerSource,
        200,
      ),
    };
  }
}

function applySourceLimits(
  contents: ScrapedContent[],
  limits: ArticleSourceLimits,
): {
  contents: ScrapedContent[];
  filteredOldCount: number;
  truncatedCount: number;
} {
  const cutoff = Date.now() - limits.maxAgeDays * 24 * 60 * 60 * 1000;
  const annotated = contents.map((content, index) => ({
    content,
    index,
    timestamp: parsePublishTimestamp(content.publishDate),
  }));
  const recent = annotated.filter((item) =>
    item.timestamp === undefined || item.timestamp >= cutoff
  );
  const sorted = recent.toSorted((a, b) => {
    if (a.timestamp !== undefined && b.timestamp !== undefined) {
      return b.timestamp - a.timestamp;
    }
    if (a.timestamp !== undefined) return -1;
    if (b.timestamp !== undefined) return 1;
    return a.index - b.index;
  });
  const limited = sorted.slice(0, limits.maxItemsPerSource);
  return {
    contents: limited.map((item) => item.content),
    filteredOldCount: annotated.length - recent.length,
    truncatedCount: Math.max(0, recent.length - limited.length),
  };
}

function parsePublishTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function normalizeLimit(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), 1), max);
}
