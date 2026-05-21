import { WeixinTemplate } from "@src/features/weixin-article/domain/renderable-article.ts";
import { LLMProvider } from "@src/core/ports/llm.ts";
import { RetryUtil } from "@src/utils/retry.util.ts";
import { Logger } from "@zilla/logger";
import {
  getDynamicHtmlSystemPrompt,
  getDynamicHtmlUserPrompt,
} from "@src/features/weixin-article/rendering/dynamic/dynamic-html.prompt.ts";
import { postProcessDynamicHtml } from "@src/features/weixin-article/rendering/dynamic/html-post-processor.ts";
import { cleanLLMJsonText } from "@src/utils/llm-output.ts";
import { PromptProfileName } from "@src/prompts/prompt-profile.ts";

const logger = new Logger("weixin-dynamic-html-generator");

interface DynamicHtmlResponse {
  html: string;
  theme?: string;
  notes?: string;
}

export class WeixinDynamicHtmlGenerator {
  constructor(
    private llm: LLMProvider,
    private readonly promptProfile?: PromptProfileName,
  ) {}

  public async generate(articles: WeixinTemplate[]): Promise<string> {
    if (!articles.length) {
      throw new Error("动态模板生成需要至少一篇文章");
    }

    return await RetryUtil.retryOperation(async () => {
      const response = await this.llm.createChatCompletion([
        {
          role: "system",
          content: getDynamicHtmlSystemPrompt(this.promptProfile),
        },
        {
          role: "user",
          content: getDynamicHtmlUserPrompt(articles, this.promptProfile),
        },
      ], {
        temperature: 0.6,
        max_tokens: 6000,
        response_format: { type: "json_object" },
      });

      const completion = response.choices?.[0]?.message?.content;
      if (!completion) {
        throw new Error("未获取到动态 HTML 生成结果");
      }

      const parsed = parseDynamicHtmlResponse(completion);
      const result = postProcessDynamicHtml(parsed.html);
      logger.info(
        `动态微信模板生成完成: theme=${
          parsed.theme || "auto"
        }, footnotes=${result.footnotes.length}`,
      );
      return result.html;
    }, { maxRetries: 2, baseDelay: 1000 });
  }
}

function parseDynamicHtmlResponse(completion: string): DynamicHtmlResponse {
  const clean = cleanLLMJsonText(completion);
  try {
    const parsed = JSON.parse(clean) as DynamicHtmlResponse;
    if (!parsed.html || typeof parsed.html !== "string") {
      throw new Error("缺少 html 字段");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `解析动态 HTML JSON 失败: ${
        error instanceof Error ? error.message : "未知错误"
      }`,
    );
  }
}
