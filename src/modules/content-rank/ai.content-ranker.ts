import { RetryUtil } from "@src/utils/retry.util.ts";
import { ScrapedContent } from "@src/modules/interfaces/scraper.interface.ts";
import { LLMFactory } from "@src/providers/llm/llm-factory.ts";
import { ChatMessage } from "@src/providers/interfaces/llm.interface.ts";
import {
  getSystemPrompt,
  getUserPrompt,
} from "@src/prompts/content-ranker.prompt.ts";
import { RankResult } from "@src/modules/interfaces/content-ranker.interface.ts";
import { Logger } from "@zilla/logger";
import { stripMarkdownFence } from "@src/utils/llm-output.ts";

const logger = new Logger("ai-content-ranker");

export class ContentRanker {
  private llmFactory: LLMFactory;

  constructor() {
    this.llmFactory = LLMFactory.getInstance();
    logger.info("Ranker使用统一LLM配置");
  }

  public async rankContents(contents: ScrapedContent[]): Promise<RankResult[]> {
    if (!contents.length) {
      return [];
    }

    return RetryUtil.retryOperation(
      async () => {
        const llmProvider = await this.llmFactory.getDefaultProvider();
        const messages: ChatMessage[] = [
          { role: "system", content: getSystemPrompt() },
          { role: "user", content: getUserPrompt(contents) },
        ];

        const response = await llmProvider.createChatCompletion(messages);

        const result = response.choices?.[0]?.message?.content;
        if (!result) {
          throw new Error("未获取到有效的评分结果");
        }

        return parseRankingResult(result);
      },
    );
  }

  public async rankContentsBatch(
    contents: ScrapedContent[],
    batchSize: number = 5,
  ): Promise<RankResult[]> {
    const results: RankResult[] = [];

    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      const batchResults = await this.rankContents(batch);
      results.push(...batchResults);

      if (i + batchSize < contents.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}

export function parseRankingResult(result: string): RankResult[] {
  const lines = stripReasoningContent(result)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rankings = lines.flatMap((line) => {
    const parsed = parseRankingLine(line);
    return parsed ? [parsed] : [];
  });

  if (!rankings.length) {
    throw new Error(`未解析到有效的评分结果: ${result.slice(0, 200)}`);
  }

  return rankings;
}

function stripReasoningContent(result: string): string {
  let cleaned = stripMarkdownFence(result)
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .trim();

  const unclosedThinkIndex = cleaned.search(/<think\b[^>]*>/i);
  if (unclosedThinkIndex >= 0) {
    const afterThink = cleaned
      .slice(unclosedThinkIndex)
      .replace(/<think\b[^>]*>/i, "");
    const firstRankingLineIndex = afterThink
      .split("\n")
      .findIndex((line) => parseRankingLine(line.trim()) !== null);

    if (firstRankingLineIndex >= 0) {
      cleaned = afterThink.split("\n").slice(firstRankingLineIndex).join("\n");
    } else {
      cleaned = cleaned.slice(0, unclosedThinkIndex);
    }
  }

  return cleaned;
}

function parseRankingLine(line: string): RankResult | null {
  const cleanedLine = line
    .replace(/^[-*]\s*/, "")
    .replace(/^文章ID[:：]?\s*/i, "")
    .replace(/\s*分数[:：]\s*/i, " ")
    .trim();

  const match = cleanedLine.match(/^(\S+?)(?:[\s:：]+)(\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const [, id, scoreStr] = match;
  const score = parseFloat(scoreStr);

  if (isNaN(score)) {
    return null;
  }

  return { id: id.replace(/[:：]$/, ""), score };
}
