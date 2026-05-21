import {
  FetchProviderId,
  fetchProviderRegistry,
} from "@src/integrations/fetch/fetch-provider-registry.ts";
import { scraperRegistry } from "@src/integrations/fetch/scraper-registry.ts";
import { ContentScraper } from "@src/core/ports/content-scraper.ts";
import {
  ArticleSource,
} from "@src/features/weixin-article/domain/article-source.ts";
import type { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";
import type {
  ArticleContentFetcher,
  ArticleContentFetchFailure,
  ArticleContentFetchResult,
} from "@src/features/weixin-article/services/content-scrape.service.ts";

type ArticleFetchProvider = FetchProviderId;

export class ArticleFetchRouter implements ArticleContentFetcher {
  private readonly config?: ResolvedTrendPublishConfig;
  private readonly scrapers: Map<ArticleFetchProvider, ContentScraper>;

  constructor(
    configOrScrapers?:
      | ResolvedTrendPublishConfig
      | Map<ArticleFetchProvider, ContentScraper>,
    scrapers = new Map<ArticleFetchProvider, ContentScraper>(),
  ) {
    if (configOrScrapers instanceof Map) {
      this.config = undefined;
      this.scrapers = configOrScrapers;
      return;
    }
    this.config = configOrScrapers;
    this.scrapers = scrapers;
  }

  async scrape(
    source: ArticleSource,
    onAttemptFailure?: (
      failure: ArticleContentFetchFailure,
    ) => Promise<void> | void,
  ): Promise<ArticleContentFetchResult> {
    const failures: ArticleContentFetchFailure[] = [];

    for (const provider of source.providers as ArticleFetchProvider[]) {
      try {
        const contents = await this.getScraper(provider).scrape(source.url);
        if (contents.length > 0) {
          return {
            contents,
            provider,
            failures,
          };
        }

        const failure = {
          provider,
          message: "抓取成功但未返回内容",
        };
        failures.push(failure);
        await onAttemptFailure?.(failure);
      } catch (error) {
        const failure = {
          provider,
          message: error instanceof Error ? error.message : String(error),
        };
        failures.push(failure);
        await onAttemptFailure?.(failure);
      }
    }

    return { contents: [], failures };
  }

  private getScraper(provider: ArticleFetchProvider): ContentScraper {
    const existing = this.scrapers.get(provider);
    if (existing) {
      return existing;
    }

    const scraper = scraperRegistry.get(
      fetchProviderRegistry.get(provider).scraperType,
    ).create({ config: this.config });
    this.scrapers.set(provider, scraper);
    return scraper;
  }
}
