import { assertEquals } from "@std/assert";
import { WeixinArticleRenderService } from "@src/features/weixin-article/services/article-render.service.ts";

Deno.test("toTemplateData converts scraped content into renderable article model", () => {
  const service = new WeixinArticleRenderService(fakeRenderer());

  const result = service.toTemplateData([{
    id: "raw-1",
    title: "AI 新闻",
    content: "正文",
    url: "https://example.com",
    publishDate: "2026-05-21",
    metadata: {
      keywords: ["AI", "模型"],
      source: "test",
    },
    media: [{
      type: "image",
      url: "https://example.com/image.png",
      size: { width: 1200, height: 675 },
    }],
  }]);

  assertEquals(result, [{
    id: "raw-1",
    title: "AI 新闻",
    content: "正文",
    url: "https://example.com",
    publishDate: "2026-05-21",
    metadata: {
      keywords: ["AI", "模型"],
      source: "test",
    },
    keywords: ["AI", "模型"],
    media: [{
      type: "image",
      url: "https://example.com/image.png",
      size: { width: 1200, height: 675 },
    }],
  }]);
});

Deno.test("toTemplateData falls back to empty keywords when metadata is not an array", () => {
  const service = new WeixinArticleRenderService(fakeRenderer());

  const result = service.toTemplateData([{
    id: "raw-2",
    title: "AI 新闻",
    content: "正文",
    url: "https://example.com",
    publishDate: "2026-05-21",
    metadata: { keywords: "AI" },
  }]);

  assertEquals(result[0].keywords, []);
});

function fakeRenderer() {
  return {
    setUploadContentImages: () => {},
    render: () => Promise.resolve(""),
  };
}
