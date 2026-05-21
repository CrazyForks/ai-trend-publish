import {
  ArticleFetchProvider,
  ArticleSource,
  parseArticleSources,
} from "@src/features/weixin-article/domain/article-source.ts";
import {
  FetchProviderId,
  fetchProviderRegistry,
  inferFetchProvider,
} from "@src/integrations/fetch/fetch-provider-registry.ts";
import {
  FetchProviderName,
  ResolvedTrendPublishConfig,
} from "@src/utils/config/define-config.ts";

export function planArticleSources(
  config: Pick<
    ResolvedTrendPublishConfig,
    "features" | "fetchGroups" | "providers"
  >,
): ArticleSource[] {
  if (!config.fetchGroups.default) {
    throw new Error("未配置默认抓取分组: fetchGroups.default");
  }

  return parseArticleSources(config.features.article.sources).map((source) => {
    const groupProviders = config.fetchGroups[source.group];
    if (!groupProviders) {
      throw new Error(
        `数据源 ${source.raw} 引用了未定义的抓取分组: ${source.group}`,
      );
    }

    const providers = resolveSourceProviders(source.url, groupProviders);
    validateSourceProviders(source.url, providers, config);

    return {
      ...source,
      providers,
    };
  });
}

export function resolveSourceProviders(
  url: string,
  groupProviders: FetchProviderName[],
): ArticleFetchProvider[] {
  if (groupProviders.length === 0) {
    throw new Error(`数据源 ${url} 的抓取分组未配置任何 provider`);
  }

  const providers = groupProviders.flatMap((provider) =>
    provider === "auto" ? [inferFetchProvider(url)] : [provider]
  );
  return [...new Set(providers)] as ArticleFetchProvider[];
}

export function inferProvider(url: string): ArticleFetchProvider {
  return inferFetchProvider(url);
}

function validateSourceProviders(
  url: string,
  providers: ArticleFetchProvider[],
  config: Pick<ResolvedTrendPublishConfig, "providers">,
): void {
  for (const provider of providers) {
    const adapter = fetchProviderRegistry.get(provider as FetchProviderId);
    if (!adapter.isConfigured(config as ResolvedTrendPublishConfig)) {
      throw new Error(
        `数据源 ${url} 需要配置 providers.fetch.${provider}`,
      );
    }
  }
}
