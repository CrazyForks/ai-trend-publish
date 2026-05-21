import { ScrapedContent } from "@src/core/ports/content-scraper.ts";

export class WeixinArticleTitleService {
  public generateSummaryTitle(contents: ScrapedContent[]): string {
    return formatSummaryTitle(buildFallbackSummaryTitle(contents));
  }
}

export function getCoverTitle(title: string): string {
  const titlePart = title.split(" | ").at(1) ?? title;
  const cleanedTitle = titlePart
    .replace(/^\d{4}[/-]\d{1,2}[/-]\d{1,2}\s*AI速递\s*\|?\s*/i, "")
    .replace(/^AI速递\s*\|?\s*/i, "")
    .trim();

  return (cleanedTitle || "AI趋势速递").slice(0, 30);
}

export function formatSummaryTitle(title: string): string {
  const cleanTitle = title.trim() || "AI趋势速递";
  return `${new Date().toLocaleDateString()} AI速递 | ${cleanTitle}`.slice(
    0,
    64,
  );
}

export function buildFallbackSummaryTitle(contents: ScrapedContent[]): string {
  const firstTitle = contents.find((content) => content.title?.trim())?.title;
  if (!firstTitle) {
    return "AI趋势速递";
  }

  return firstTitle
    .replace(/[｜|].*$/, "")
    .replace(/^\d{4}[/-]\d{1,2}[/-]\d{1,2}\s*/, "")
    .trim()
    .slice(0, 20) || "AI趋势速递";
}
