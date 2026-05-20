import { mkdirSync } from "node:fs";
import { join } from "node:path";

export class WeixinArticleDryRunOutputService {
  public async writeHtml(
    renderedTemplate: string,
    outputDir?: string,
  ): Promise<string> {
    const tempDir = outputDir || join(Deno.cwd(), "src/temp");
    mkdirSync(tempDir, { recursive: true });
    const outputPath = join(
      tempDir,
      `dry_run_weixin_article_${
        new Date().toISOString().replace(/[:.]/g, "-")
      }.html`,
    );
    await Deno.writeTextFile(outputPath, wrapPreviewHtml(renderedTemplate));
    return outputPath;
  }
}

function wrapPreviewHtml(content: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>微信文章 Dry Run</title>
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
