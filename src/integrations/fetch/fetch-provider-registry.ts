import {
  ProviderAdapter,
  ProviderRegistry,
} from "@src/registry/provider-registry.ts";
import {
  FetchProviderName,
  ResolvedTrendPublishConfig,
} from "@src/utils/config/define-config.ts";
import { ScraperType } from "@src/integrations/fetch/scraper-type.ts";

export type FetchProviderId = Exclude<FetchProviderName, "auto">;

export interface FetchProviderAdapter
  extends ProviderAdapter<ResolvedTrendPublishConfig, FetchProviderId> {
  scraperType: ScraperType;
  matches(url: URL): boolean;
}

export const fetchProviderRegistry = new ProviderRegistry<
  ResolvedTrendPublishConfig,
  FetchProviderAdapter
>();

fetchProviderRegistry.register({
  id: "twitter",
  kind: "fetch",
  scraperType: ScraperType.TWITTER,
  isConfigured: (config) =>
    Boolean(
      config.providers.fetch.twitter.bearerToken ||
        config.providers.fetch.twitter.xquikApiKey,
    ),
  matches: (url) =>
    url.hostname === "x.com" ||
    url.hostname.endsWith(".x.com") ||
    url.hostname === "twitter.com" ||
    url.hostname.endsWith(".twitter.com"),
});

fetchProviderRegistry.register({
  id: "rss",
  kind: "fetch",
  scraperType: ScraperType.RSSHUB,
  isConfigured: () => true,
  matches: (url) =>
    url.hostname.includes("rsshub") ||
    url.pathname.endsWith(".rss") ||
    url.pathname.endsWith(".xml"),
});

fetchProviderRegistry.register({
  id: "jina",
  kind: "fetch",
  scraperType: ScraperType.JINA_READER,
  isConfigured: (config) => Boolean(config.providers.fetch.jina.apiKey),
  matches: () => false,
});

fetchProviderRegistry.register({
  id: "firecrawl",
  kind: "fetch",
  scraperType: ScraperType.FIRECRAWL,
  isConfigured: (config) => Boolean(config.providers.fetch.firecrawl.apiKey),
  matches: () => true,
});

export function inferFetchProvider(url: string): FetchProviderId {
  const parsed = new URL(url);
  const matched = fetchProviderRegistry
    .list()
    .find((adapter) => adapter.matches(parsed));
  if (!matched) {
    throw new Error(`无法推断数据源抓取 provider: ${url}`);
  }
  return matched.id;
}
