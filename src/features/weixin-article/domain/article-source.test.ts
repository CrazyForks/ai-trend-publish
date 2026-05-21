import { assertEquals, assertThrows } from "@std/assert";
import { parseArticleSources, parseSourceInput } from "./article-source.ts";

Deno.test("parseSourceInput uses default group for plain URL", () => {
  assertEquals(parseSourceInput("https://news.ycombinator.com/"), {
    raw: "https://news.ycombinator.com/",
    group: "default",
    url: "https://news.ycombinator.com/",
  });
});

Deno.test("parseSourceInput parses custom fetch group prefix", () => {
  assertEquals(parseSourceInput("web:https://example.com/ai-news"), {
    raw: "web:https://example.com/ai-news",
    group: "web",
    url: "https://example.com/ai-news",
  });
});

Deno.test("parseArticleSources dedupes by group and normalized URL", () => {
  assertEquals(
    parseArticleSources([
      "https://example.com",
      "https://example.com/",
      "web:https://example.com/",
    ]),
    [
      {
        raw: "https://example.com",
        group: "default",
        url: "https://example.com/",
      },
      {
        raw: "web:https://example.com/",
        group: "web",
        url: "https://example.com/",
      },
    ],
  );
});

Deno.test("parseSourceInput rejects invalid URL", () => {
  assertThrows(
    () => parseSourceInput("web:not-a-url"),
    Error,
    "数据源 URL 无效",
  );
});
