import { WeixinTemplate } from "@src/modules/render/weixin/interfaces/article.type.ts";
import { LLMProvider } from "@src/providers/interfaces/llm.interface.ts";
import { LLMFactory } from "@src/providers/llm/llm-factory.ts";
import { RetryUtil } from "@src/utils/retry.util.ts";
import { Logger } from "@zilla/logger";
import {
  getDynamicHtmlSystemPrompt,
  getDynamicHtmlUserPrompt,
} from "@src/modules/render/weixin/dynamic/dynamic-html.prompt.ts";
import { postProcessDynamicHtml } from "@src/modules/render/weixin/dynamic/html-post-processor.ts";
import { cleanLLMJsonText } from "@src/utils/llm-output.ts";

const logger = new Logger("weixin-dynamic-html-generator");

interface DynamicHtmlResponse {
  html: string;
  theme?: string;
  notes?: string;
}

interface LLMProviderFactory {
  getLLMProvider(
    typeOrConfig: string,
    needRefresh?: boolean,
  ): Promise<LLMProvider>;
  getDefaultProvider(): Promise<LLMProvider>;
}

export class WeixinDynamicHtmlGenerator {
  constructor(
    private llmFactory: LLMProviderFactory = LLMFactory.getInstance(),
  ) {
  }

  public async generate(articles: WeixinTemplate[]): Promise<string> {
    if (!articles.length) {
      throw new Error("动态模板生成需要至少一篇文章");
    }

    return await RetryUtil.retryOperation(async () => {
      const llm = await this.llmFactory.getDefaultProvider();
      const response = await llm.createChatCompletion([
        {
          role: "system",
          content: getDynamicHtmlSystemPrompt(),
        },
        {
          role: "user",
          content: getDynamicHtmlUserPrompt(articles),
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
