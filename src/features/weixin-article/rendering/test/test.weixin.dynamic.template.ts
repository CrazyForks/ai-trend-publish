import { assertStringIncludes } from "@std/assert";
import {
  DynamicHtmlGenerator,
  WeixinArticleTemplateRenderer,
} from "@src/features/weixin-article/rendering/article.renderer.ts";
import { WeixinTemplate } from "@src/features/weixin-article/domain/renderable-article.ts";

const articles: WeixinTemplate[] = [{
  id: "dynamic-1",
  title: "动态模板测试",
  content: "这是第一段内容。<next_paragraph />这是第二段内容。",
  url: "https://example.com/dynamic",
  publishDate: "2026-05-20",
  metadata: {},
  keywords: ["动态模板"],
}];

Deno.test("dynamic template returns generated html", async () => {
  const generator: DynamicHtmlGenerator = {
    generate: () =>
      Promise.resolve(
        '<section style="margin:0;"><p style="margin:0;">AI 动态排版结果</p></section>',
      ),
  };
  const renderer = new WeixinArticleTemplateRenderer(generator);
  await renderer.initializeTemplates();

  const html = await renderer.render(articles, "dynamic");

  assertStringIncludes(html, "AI 动态排版结果");
});

Deno.test("dynamic template falls back to minimal when generator fails", async () => {
  const generator: DynamicHtmlGenerator = {
    generate: () => Promise.reject(new Error("LLM failed")),
  };
  const renderer = new WeixinArticleTemplateRenderer(generator);
  await renderer.initializeTemplates();

  const html = await renderer.render(articles, "dynamic");

  assertStringIncludes(html, "MINIMAL READING");
  assertStringIncludes(html, "动态模板测试");
});
