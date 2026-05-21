import { ArticleSource } from "@src/features/weixin-article/domain/article-source.ts";
import { ScrapedContent } from "@src/core/ports/content-scraper.ts";
import { INotifier } from "@src/core/ports/notifier.ts";
import { WorkflowTerminateError } from "@src/core/workflow/workflow-error.ts";
import { Logger } from "@zilla/logger";
import ProgressBar from "jsr:@deno-library/progress";
import { WeixinArticleWorkflowStats } from "./workflow-stats.ts";

type SourceType = "all" | "firecrawl" | "twitter";

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

export interface ArticleContentFetcher {
  scrape(
    source: ArticleSource,
    onAttemptFailure?: (
      failure: ArticleContentFetchFailure,
    ) => Promise<void> | void,
  ): Promise<ArticleContentFetchResult>;
}

const logger = new Logger("weixin-article-scrape-service");

export class WeixinArticleContentScrapeService {
  constructor(
    private readonly sources: ArticleSource[],
    private readonly notifier: INotifier,
    private readonly stats: WeixinArticleWorkflowStats,
    private readonly contentFetcher: ArticleContentFetcher,
  ) {
  }

  async loadSources(
    sourceType: SourceType = "all",
  ): Promise<WeixinArticleSourceLoadResult> {
    let sources = [...this.sources];
    if (sourceType === "firecrawl") {
      sources = sources.filter((source) =>
        source.providers.includes("firecrawl")
      );
    }
    if (sourceType === "twitter") {
      sources = sources.filter((source) =>
        source.providers.includes("twitter")
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
    const contents: ScrapedContent[] = [];
    const scrapeProgress = new ProgressBar({
      title: "内容抓取进度",
      total: sourceLoadResult.totalSources,
      clear: true,
      display: ":title | :percent | :completed/:total | :time \n",
    });
    let scrapeCompleted = 0;
    let totalArticles = 0;

    for (const source of sourceLoadResult.sources) {
      const sourceContents = await this.scrapeSource(source);
      contents.push(...sourceContents);
      totalArticles += sourceContents.length;
      await scrapeProgress.render(++scrapeCompleted, {
        title:
          `抓取 ${source.group}: ${source.url} | 已获取文章: ${totalArticles}篇`,
      });
    }

    this.stats.contents = contents.length;
    if (this.stats.contents === 0) {
      throw new WorkflowTerminateError("未获取到任何内容，流程终止");
    }

    return contents;
  }

  private async scrapeSource(
    source: ArticleSource,
  ): Promise<ScrapedContent[]> {
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
      this.stats.success++;
      logger.info(
        `[${result.provider}] ${source.url} 抓取成功: ${result.contents.length} 篇`,
      );
      return result.contents;
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
    return [];
  }
}
