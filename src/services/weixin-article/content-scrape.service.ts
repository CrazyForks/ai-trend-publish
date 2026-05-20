import { getDataSources } from "@src/data-sources/getDataSources.ts";
import {
  ContentScraper,
  ScrapedContent,
} from "@src/modules/interfaces/scraper.interface.ts";
import { BarkNotifier } from "@src/modules/notify/bark.notify.ts";
import { FireCrawlScraper } from "@src/modules/scrapers/fireCrawl.scraper.ts";
import { TwitterScraper } from "@src/modules/scrapers/twitter.scraper.ts";
import { WorkflowTerminateError } from "@src/works/workflow-error.ts";
import { Logger } from "@zilla/logger";
import ProgressBar from "jsr:@deno-library/progress";
import { WeixinArticleWorkflowStats } from "./workflow-stats.ts";

type SourceType = "all" | "firecrawl" | "twitter";

interface SourceItem {
  identifier: string;
}

export interface WeixinArticleSourceLoadResult {
  configs: {
    firecrawl: SourceItem[];
    twitter: SourceItem[];
  };
  totalSources: number;
}

const logger = new Logger("weixin-article-scrape-service");

export class WeixinArticleContentScrapeService {
  private readonly scrapers = new Map<string, ContentScraper>();

  constructor(
    private readonly notifier: BarkNotifier,
    private readonly stats: WeixinArticleWorkflowStats,
  ) {
    this.scrapers.set("fireCrawl", new FireCrawlScraper());
    this.scrapers.set("twitter", new TwitterScraper());
  }

  async loadSources(
    sourceType: SourceType = "all",
  ): Promise<WeixinArticleSourceLoadResult> {
    const configs = await getDataSources();
    if (!configs.firecrawl) {
      throw new WorkflowTerminateError("未找到firecrawl数据源配置");
    }
    if (!configs.twitter) {
      throw new WorkflowTerminateError("未找到twitter数据源配置");
    }
    if (sourceType === "firecrawl") {
      configs.twitter = [];
    }
    if (sourceType === "twitter") {
      configs.firecrawl = [];
    }

    const totalSources = configs.firecrawl.length + configs.twitter.length;
    if (totalSources === 0) {
      throw new WorkflowTerminateError("未配置任何数据源");
    }

    logger.info(`[数据源] 发现 ${totalSources} 个数据源`);
    return { configs, totalSources };
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

    const fireCrawlScraper = this.getScraper("fireCrawl");
    for (const source of sourceLoadResult.configs.firecrawl) {
      const sourceContents = await this.scrapeSource(
        "FireCrawl",
        source,
        fireCrawlScraper,
      );
      contents.push(...sourceContents);
      totalArticles += sourceContents.length;
      await scrapeProgress.render(++scrapeCompleted, {
        title:
          `抓取 FireCrawl: ${source.identifier}  | 已获取文章: ${totalArticles}篇`,
      });
    }

    const twitterScraper = this.getScraper("twitter");
    for (const source of sourceLoadResult.configs.twitter) {
      const sourceContents = await this.scrapeSource(
        "Twitter",
        source,
        twitterScraper,
      );
      contents.push(...sourceContents);
      totalArticles += sourceContents.length;
      await scrapeProgress.render(++scrapeCompleted, {
        title:
          `抓取 Twitter: ${source.identifier} | 已获取文章: ${totalArticles}篇`,
      });
    }

    this.stats.contents = contents.length;
    if (this.stats.contents === 0) {
      throw new WorkflowTerminateError("未获取到任何内容，流程终止");
    }

    return contents;
  }

  private getScraper(key: string): ContentScraper {
    const scraper = this.scrapers.get(key);
    if (!scraper) {
      throw new WorkflowTerminateError(`${key} scraper not found`);
    }
    return scraper;
  }

  private async scrapeSource(
    type: string,
    source: SourceItem,
    scraper: ContentScraper,
  ): Promise<ScrapedContent[]> {
    try {
      logger.debug(`[${type}] 抓取: ${source.identifier}`);
      const contents = await scraper.scrape(source.identifier);
      this.stats.success++;
      return contents;
    } catch (error) {
      this.stats.failed++;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[${type}] ${source.identifier} 抓取失败:`, message);
      await this.notifier.warning(
        `${type}抓取失败`,
        `源: ${source.identifier}\n错误: ${message}`,
      );
      return [];
    }
  }
}
