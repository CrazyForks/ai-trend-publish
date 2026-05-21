export type ArticleFetchProvider = string;

export interface ArticleSource {
  raw: string;
  url: string;
  group: string;
  providers: ArticleFetchProvider[];
}

export interface ParsedArticleSource {
  raw: string;
  group: string;
  url: string;
}

export function parseArticleSources(
  sources: string[],
): ParsedArticleSource[] {
  if (sources.length === 0) {
    throw new Error("未配置文章数据源: features.article.sources 不能为空");
  }

  const seen = new Set<string>();
  const parsedSources: ParsedArticleSource[] = [];

  for (const raw of sources) {
    const parsed = parseSourceInput(raw);
    const normalizedKey = `${parsed.group}:${new URL(parsed.url).href}`;
    if (seen.has(normalizedKey)) {
      continue;
    }
    seen.add(normalizedKey);
    parsedSources.push({
      raw: parsed.raw,
      group: parsed.group,
      url: new URL(parsed.url).href,
    });
  }

  if (parsedSources.length === 0) {
    throw new Error("未配置有效文章数据源");
  }

  return parsedSources;
}

export function parseSourceInput(rawSource: string): ParsedArticleSource {
  const raw = rawSource.trim();
  if (!raw) {
    throw new Error("数据源不能为空字符串");
  }

  if (isHttpUrl(raw)) {
    return { raw, group: "default", url: raw };
  }

  const separatorIndex = raw.indexOf(":");
  if (separatorIndex <= 0) {
    throw new Error(`数据源格式无效: ${raw}`);
  }

  const group = raw.slice(0, separatorIndex).trim();
  const url = raw.slice(separatorIndex + 1).trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(group)) {
    throw new Error(`数据源分组名无效: ${group}`);
  }
  if (!isHttpUrl(url)) {
    throw new Error(`数据源 URL 无效: ${raw}`);
  }

  return { raw, group, url };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
