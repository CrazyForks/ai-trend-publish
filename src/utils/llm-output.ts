export function stripThinkTags(input: string): string {
  return input
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think\b[^>]*>/gi, "")
    .trim();
}

export function stripMarkdownFence(input: string): string {
  return input
    .replace(/^\s*```(?:[\w-]+)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/^\s*```\s*$/gm, "")
    .trim();
}

export function cleanLLMText(input: string): string {
  return stripMarkdownFence(stripThinkTags(input))
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
}

export function cleanLLMTitle(input: string): string {
  const cleaned = cleanLLMText(input);
  const candidates = cleaned
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*[-*#>\d.、）)]\s*/, "")
        .replace(/^(标题|主标题|建议标题|文章标题)\s*[:：]\s*/i, "")
        .replace(/^["'“”‘’]+|["'“”‘’。]+$/g, "")
        .trim()
    )
    .filter(Boolean)
    .filter((line) => !isReasoningLine(line));
  const title = candidates.at(-1) ?? "";
  if (!title || isReasoningLine(title)) {
    return "";
  }
  return title
    .replace(/[。.!！?？]+$/g, "")
    .trim()
    .slice(0, 48);
}

export function cleanLLMJsonText(input: string): string {
  const cleaned = stripMarkdownFence(stripThinkTags(input));
  const jsonObject = extractFirstJsonObject(cleaned);
  return jsonObject ?? cleaned.trim();
}

function isReasoningLine(line: string): boolean {
  return /^(让我|我来|我们先|根据以上|以下是|分析|推理|思考|步骤|结论[:：]|输出[:：])/i
    .test(line) ||
    /<think\b|<\/think>/i.test(line);
}

export function normalizeLLMResponse<T>(response: T): T {
  if (!response || typeof response !== "object") {
    return response;
  }

  const maybeResponse = response as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  if (!Array.isArray(maybeResponse.choices)) {
    return response;
  }

  for (const choice of maybeResponse.choices) {
    const content = choice?.message?.content;
    if (typeof content === "string") {
      choice.message!.content = stripMarkdownFence(stripThinkTags(content));
    }
  }

  return response;
}

function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index++) {
    const char = input[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return input.slice(start, index + 1);
      }
    }
  }

  return null;
}
