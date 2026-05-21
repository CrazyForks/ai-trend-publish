import { assertEquals } from "@std/assert";
import {
  ArticleContentFetcher,
  WeixinArticleContentScrapeService,
} from "@src/features/weixin-article/services/content-scrape.service.ts";
import { INotifier } from "@src/core/ports/notifier.ts";

Deno.test("content scrape service uses injected fetcher and continues after source failure", async () => {
  const warnings: string[] = [];
  const fetcher: ArticleContentFetcher = {
    scrape: (source) =>
      Promise.resolve(
        source.url.includes("ok")
          ? {
            contents: [{
              id: "ok-1",
              title: "ok",
              content: "content",
              url: source.url,
              publishDate: "2026-05-21",
              metadata: {},
            }],
            provider: "mock",
            failures: [],
          }
          : {
            contents: [],
            failures: [{ provider: "mock", message: "boom" }],
          },
      ),
  };
  const stats = { success: 0, failed: 0, contents: 0, duplicates: 0 };
  const service = new WeixinArticleContentScrapeService(
    [
      {
        raw: "https://example.com/fail",
        group: "default",
        url: "https://example.com/fail",
        providers: ["mock"],
      },
      {
        raw: "https://example.com/ok",
        group: "default",
        url: "https://example.com/ok",
        providers: ["mock"],
      },
    ],
    notifier(warnings),
    stats,
    fetcher,
  );

  const sources = await service.loadSources();
  const contents = await service.scrapeAll(sources);

  assertEquals(contents.map((content) => content.id), ["ok-1"]);
  assertEquals(stats, { success: 1, failed: 1, contents: 1, duplicates: 0 });
  assertEquals(warnings.length, 1);
});

function notifier(warnings: string[]): INotifier {
  return {
    refresh: () => Promise.resolve(),
    info: () => Promise.resolve(true),
    success: () => Promise.resolve(true),
    warning: (_title, message) => {
      warnings.push(message);
      return Promise.resolve(true);
    },
    error: () => Promise.resolve(true),
    notify: () => Promise.resolve(true),
  };
}
