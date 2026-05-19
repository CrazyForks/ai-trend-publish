import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { WeixinTemplate } from "@src/modules/render/weixin/interfaces/article.type.ts";
import { formatDate } from "@src/utils/common.ts";
import ejs from "npm:ejs";

const originalConsoleLog = console.log;

function formatLog(message: any) {
  originalConsoleLog(`[${new Date().toLocaleString()}]`, message);
}

console.log = formatLog;

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='675' viewBox='0 0 1200 675'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23f8fafc'/%3E%3Cstop offset='1' stop-color='%23e5e7eb'/%3E%3C/linearGradient%3E%3ClinearGradient id='m' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23bfdbfe'/%3E%3Cstop offset='1' stop-color='%23dbeafe'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='675' fill='url(%23g)'/%3E%3Crect x='80' y='80' width='1040' height='515' rx='32' fill='%23ffffff' stroke='%23d1d5db' stroke-width='2'/%3E%3Ccircle cx='248' cy='226' r='62' fill='%23e5e7eb'/%3E%3Ccircle cx='330' cy='188' r='24' fill='%23dbeafe'/%3E%3Cpath d='M154 505L386 276l138 132 104-98 418 195H154z' fill='url(%23m)'/%3E%3Cpath d='M154 505L386 276l138 132 104-98 418 195' fill='none' stroke='%2393c5fd' stroke-width='8' stroke-linejoin='round'/%3E%3Crect x='700' y='180' width='290' height='28' rx='14' fill='%23e5e7eb'/%3E%3Crect x='700' y='235' width='390' height='22' rx='11' fill='%23eef2f7'/%3E%3Crect x='700' y='279' width='340' height='22' rx='11' fill='%23eef2f7'/%3E%3Crect x='700' y='323' width='250' height='22' rx='11' fill='%23eef2f7'/%3E%3C/svg%3E";

// 生成示例HTML预览
const previewArticles: WeixinTemplate[] = [
  {
    id: "1",
    title: "人工智能发展最新突破：GPT-4展现多模态能力",
    content:
      `当你使用一个库时，它能够"即插即用"，这背后往往<strong>隐藏着一位工程师</strong>付出的巨大努力。编写高质量的技术文档是一项耗时且需要高度专业技能的工作。这些文档不仅包括了详细的API说明、示例代码和常见问题解答，还可能涵盖了一些最佳实践和性能优化建议。<next_paragraph />在软件开发领域，良好的文档可以显著提高开发效率，减少因理解错误导致的bug。对于开源项目来说，优质的文档更是吸引贡献者和用户的关键因素之一。很多工程师在完成核心功能开发后，会花费大量时间来完善相关文档，以确保其他开发者能够快速上手并充分利用该库的功能。<next_paragraph />这种对细节的关注和对用户体验的重视体现了工程师的专业精神。虽然编写文档的过程可能是枯燥乏味的，但其带来的长期收益却非常可观。因此，当下次你在享受某个库带来的便利时，请记得感谢那些默默无闻地为良好文档而努力工作的工程师们。`,
    url: "https://example.com/gpt4-breakthrough",
    publishDate: formatDate(new Date().toISOString()),
    keywords: ["GPT-4", "人工智能", "多模态", "OpenAI"],
    media: [{
      url: PLACEHOLDER_IMAGE,
      type: "image",
      size: {
        width: 100,
        height: 100,
      },
    }],
    metadata: {
      author: "AI研究员",
      readTime: 5,
      wordCount: 1000,
    },
  },
  {
    id: "2",
    title: "人工智能发展最新突破：GPT-4展现多模态能力",
    content:
      `当你使用一个库时，它能够"即插即用"，这背后往往<em>隐藏着一位工程师</em>付出的巨大努力。编写高质量的技术文档是一项耗时且需要高度专业技能的工作。这些文档不仅包括了详细的API说明、示例代码和常见问题解答，还可能涵盖了一些最佳实践和性能优化建议。<next_paragraph />在软件开发领域，良好的文档可以显著提高开发效率，减少因理解错误导致的bug。对于开源项目来说，优质的文档更是吸引贡献者和用户的关键因素之一。很多工程师在完成核心功能开发后，会花费大量时间来完善相关文档，以确保其他开发者能够快速上手并充分利用该库的功能。<next_paragraph/>这种对细节的关注和对用户体验的重视体现了工程师的专业精神。虽然编写文档的过程可能是枯燥乏味的，但其带来的长期收益却非常可观。因此，当下次你在享受某个库带来的便利时，请记得感谢那些默默无闻地为良好文档而努力工作的工程师们。`,
    url: "https://example.com/gpt4-breakthrough",
    publishDate: formatDate(new Date().toISOString()),
    keywords: ["GPT-4", "人工智能", "多模态", "OpenAI"],
    media: [{
      url: PLACEHOLDER_IMAGE,
      type: "image",
      size: {
        width: 100,
        height: 100,
      },
    }, {
      url: PLACEHOLDER_IMAGE,
      type: "image",
      size: {
        width: 100,
        height: 100,
      },
    }],
    metadata: {
      author: "AI研究员",
      readTime: 5,
      wordCount: 1000,
    },
  },
  {
    id: "3",
    title: "人工智能发展最新突破：GPT-4展现多模态能力",
    content:
      `当你使用一个库时，它能够"即插即用"，这背后往往隐藏着一位工程师付出的巨大努力。编写高质量的技术文档是一项耗时且需要高度专业技能的工作。这些文档不仅包括了详细的API说明、示例代码和常见问题解答，还可能涵盖了一些最佳实践和性能优化建议。<next_paragraph/><ul>良好文档的优势：
    <li>提高开发效率</li><li>减少错误和bug</li><li>吸引更多贡献者</li></ul><next_paragraph/><ol>文档编写步骤：<li>确定目标受众</li><li>编写API参考</li><li>提供使用示例</li></ol><next_paragraph/><next_paragraph/>这种对细节的关注和对用户体验的重视体现了工程师的专业精神。虽然编写文档的过程可能是枯燥乏味的，但其带来的长期收益却非常可观。因此，当下次你在享受某个库带来的便利时，请记得感谢那些默默无闻地为良好文档而努力工作的工程师们。`,
    url: "https://example.com/gpt4-breakthrough",
    publishDate: formatDate(new Date().toISOString()),
    keywords: ["GPT-4", "人工智能", "多模态", "OpenAI"],
    metadata: {
      author: "AI研究员",
      readTime: 5,
      wordCount: 1000,
    },
  },
];

// 渲染并保存预览文件
async function renderAndSavePreview() {
  // 确保temp目录存在
  const tempDir = join(import.meta.dirname as string, "../../../../temp");
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  // //上传到微信草稿箱
  // async function uploadToDraft() {
  //   const configManager = ConfigManager.getInstance();
  //   configManager.initDefaultConfigSources();

  //   const weixinPublish = new WeixinPublisher()

  //   await weixinPublish.refresh()

  //   const publishResult = await weixinPublish.publish(
  //     html,
  //     `${new Date().toLocaleDateString()} AI速递 | Test`,
  //     "Test",
  //     "SwCSRjrdGJNaWioRQUHzgF68BHFkSlb_f5xlTquvsOSA6Yy0ZRjFo0aW9eS3JJu_"
  //   );
  //   return publishResult;
  // }

  // uploadToDraft().then((res) => {
  //   console.log(res);
  // });

  const templates = {
    default: "article.ejs",
    modern: "article.modern.ejs",
    tech: "article.tech.ejs",
    mianpro: "article.mianpro.ejs",
    longform: "article.longform.ejs",
    product: "article.product.ejs",
    minimal: "article.minimal.ejs",
    darktech: "article.darktech.ejs",
  };

  const articles = previewArticles.map((article) => ({
    ...article,
    content: normalizePreviewContent(article),
  }));

  for (const [templateType, fileName] of Object.entries(templates)) {
    const templatePath = join(
      import.meta.dirname as string,
      "../templates",
      fileName,
    );
    const template = await Deno.readTextFile(templatePath);
    const html = ejs.render(template, { articles }, { rmWhitespace: true });
    const previewHtml = wrapPreviewHtml(html);
    const outputPath = join(tempDir, `preview_weixin_${templateType}.html`);
    writeFileSync(outputPath, previewHtml, "utf-8");
    console.log(`预览文件已生成：${outputPath}`);
  }
}

Deno.test("test", async () => {
  await renderAndSavePreview();
});

function normalizePreviewContent(article: WeixinTemplate): string {
  const content = article.content.replaceAll(
    "<next_paragraph/>",
    "<next_paragraph />",
  );

  if (!article.media || article.media.length === 0) {
    return content;
  }

  const paragraphs = content.split("<next_paragraph />");
  const mediaUrls = article.media.map((media) => media.url);
  let mediaIndex = 0;
  const processed: string[] = [];

  for (const paragraph of paragraphs) {
    if (mediaIndex < mediaUrls.length) {
      processed.push(`<img src="${mediaUrls[mediaIndex]}" alt="文章配图" />`);
      mediaIndex++;
    }
    processed.push(paragraph);
  }

  return processed.filter((item) => item.trim().length > 0).join(
    "<next_paragraph />",
  );
}

function wrapPreviewHtml(content: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>微信模板预览</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;
}
