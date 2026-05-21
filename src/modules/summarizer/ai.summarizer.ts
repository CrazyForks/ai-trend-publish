import {
  ContentSummarizer,
  Summary,
} from "@src/core/ports/content-summarizer.ts";
import { LLMProvider } from "@src/core/ports/llm.ts";
import {
  getSummarizerSystemPrompt,
  getSummarizerUserPrompt,
  getTitleSystemPrompt,
  getTitleUserPrompt,
} from "@src/prompts/summarizer.prompt.ts";
import { RetryUtil } from "@src/utils/retry.util.ts";
import { Logger } from "@zilla/logger";
import { cleanLLMJsonText, cleanLLMText } from "@src/utils/llm-output.ts";
import { PromptProfileName } from "@src/prompts/prompt-profile.ts";

const logger = new Logger("ai-summarizer");

export class AISummarizer implements ContentSummarizer {
  constructor(
    private readonly llm: LLMProvider,
    private readonly promptProfile?: PromptProfileName,
  ) {
    logger.info("Summarizer使用统一LLM配置");
  }

  async summarize(
    content: string,
    options?: Record<string, any>,
  ): Promise<Summary> {
    if (!content) {
      throw new Error("Content is required for summarization");
    }

    return RetryUtil.retryOperation(async () => {
      const response = await this.llm.createChatCompletion([
        {
          role: "system",
          content: getSummarizerSystemPrompt(this.promptProfile),
        },
        {
          role: "user",
          content: getSummarizerUserPrompt({
            content,
            language: options?.language,
            minLength: options?.minLength,
            maxLength: options?.maxLength,
            promptProfile: this.promptProfile,
          }),
        },
      ], {
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const completion = response.choices[0]?.message?.content;
      if (!completion) {
        throw new Error("未获取到有效的摘要结果");
      }

      try {
        const summary = JSON.parse(cleanLLMJsonText(completion)) as Summary;
        if (
          !summary.title ||
          !summary.content
        ) {
          throw new Error("摘要结果格式不正确");
        }
        return summary;
      } catch (error) {
        throw new Error(
          `解析摘要结果失败: ${
            error instanceof Error ? error.message : "未知错误"
          }`,
        );
      }
    });
  }

  async generateTitle(
    content: string,
    options?: Record<string, any>,
  ): Promise<string> {
    return RetryUtil.retryOperation(async () => {
      const response = await this.llm.createChatCompletion([
        {
          role: "system",
          content: getTitleSystemPrompt(this.promptProfile),
        },
        {
          role: "user",
          content: getTitleUserPrompt({
            content,
            language: options?.language,
            promptProfile: this.promptProfile,
          }),
        },
      ], {
        temperature: 0.7,
        max_tokens: 100,
      });

      const title = response.choices[0]?.message?.content;
      if (!title) {
        throw new Error("未获取到有效的标题");
      }
      const cleanedTitle = cleanLLMText(title);
      if (!cleanedTitle) {
        throw new Error("标题生成结果为空");
      }
      return cleanedTitle;
    });
  }
}
