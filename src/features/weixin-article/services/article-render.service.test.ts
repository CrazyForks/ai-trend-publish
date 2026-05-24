import { assertEquals } from "@std/assert";
import { WeixinArticleRenderService } from "@src/features/weixin-article/services/article-render.service.ts";
import type { ArticlePlan } from "@src/features/weixin-article/domain/article-plan.ts";

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

Deno.test("toTemplateData follows article plan article order and filters unrelated content", () => {
  const service = new WeixinArticleRenderService(fakeRenderer());
  const result = service.toTemplateData(
    [
      content("unrelated", "无关资讯"),
      content("lead", "主线文章"),
      content("support", "补充文章"),
    ],
    {
      format: "product-review",
      thesis: "主线观点",
      targetReader: "读者",
      summary: "摘要",
      sections: [
        {
          id: "section-1",
          title: "主线",
          intent: "先讲主线",
          angle: "主线角度",
          articleIds: ["lead", "support", "lead"],
          keyPoints: [],
        },
      ],
      titleDirections: [],
      coverDirection: {
        visualBrief: "封面",
        textBrief: "封面文案",
        mood: "克制",
      },
      bodyImagePlan: {
        enabled: false,
        placements: [],
      },
      riskNotes: [],
    } satisfies ArticlePlan,
  );

  assertEquals(result.map((item) => item.id), ["lead", "support"]);
});

function content(id: string, title: string) {
  return {
    id,
    title,
    content: `${title} 正文`,
    url: `https://example.com/${id}`,
    publishDate: "2026-05-24",
    metadata: {},
  };
}

function fakeRenderer() {
  return {
    setUploadContentImages: () => {},
    render: () => Promise.resolve(""),
  };
}
