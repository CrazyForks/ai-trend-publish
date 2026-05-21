import {
  ProviderAdapter,
  ProviderCreateContext,
  ProviderRegistry,
} from "@src/registry/provider-registry.ts";
import { ContentScraper } from "@src/core/ports/content-scraper.ts";
import { FireCrawlScraper } from "@src/integrations/fetch/providers/firecrawl-scraper.ts";
import { JinaDeepSearchScraper } from "@src/integrations/fetch/providers/jina/jina-deepsearch-scraper.ts";
import { JinaScraper } from "@src/integrations/fetch/providers/jina/jina-reader-scraper.ts";
import { RsshubScraper } from "@src/integrations/fetch/providers/rsshub-scraper.ts";
import { ScraperType } from "@src/integrations/fetch/scraper-type.ts";
import { TwitterScraper } from "@src/integrations/fetch/providers/twitter-scraper.ts";
import { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";

export interface ScraperAdapter
  extends ProviderAdapter<ResolvedTrendPublishConfig, ScraperType> {
  kind: "fetch";
  create(
    context?: ProviderCreateContext<ResolvedTrendPublishConfig>,
  ): ContentScraper;
}

export const scraperRegistry = new ProviderRegistry<
  ResolvedTrendPublishConfig,
  ScraperAdapter
>();

scraperRegistry.register({
  id: ScraperType.JINA_READER,
  kind: "fetch",
  isConfigured: (config) => Boolean(config.providers.fetch.jina.apiKey),
  create: (context) =>
    new JinaScraper(context?.config?.providers.fetch.jina.apiKey),
});

scraperRegistry.register({
  id: ScraperType.JINA_DEEPSEARCH,
  kind: "fetch",
  isConfigured: (config) => Boolean(config.providers.fetch.jina.apiKey),
  create: (context) =>
    new JinaDeepSearchScraper(context?.config?.providers.fetch.jina.apiKey),
});

scraperRegistry.register({
  id: ScraperType.FIRECRAWL,
  kind: "fetch",
  isConfigured: (config) => Boolean(config.providers.fetch.firecrawl.apiKey),
  create: (context) =>
    new FireCrawlScraper(context?.config?.providers.fetch.firecrawl.apiKey),
});

scraperRegistry.register({
  id: ScraperType.RSSHUB,
  kind: "fetch",
  isConfigured: () => true,
  create: () => new RsshubScraper(),
});

scraperRegistry.register({
  id: ScraperType.TWITTER,
  kind: "fetch",
  isConfigured: (config) =>
    Boolean(
      config.providers.fetch.twitter.xquikApiKey ||
        config.providers.fetch.twitter.bearerToken,
    ),
  create: (context) =>
    new TwitterScraper(context?.config?.providers.fetch.twitter),
});
