import { assertEquals } from "@std/assert";
import {
  cleanLLMJsonText,
  cleanLLMText,
  normalizeLLMResponse,
  stripMarkdownFence,
  stripThinkTags,
} from "./llm-output.ts";

Deno.test("stripThinkTags removes closed reasoning blocks", () => {
  assertEquals(
    stripThinkTags("<think>推理过程</think>\n最终结果"),
    "最终结果",
  );
});

Deno.test("cleanLLMJsonText extracts JSON after reasoning and prose", () => {
  const result = cleanLLMJsonText(`
<think>
先分析一下。
没有闭合标签也不应该影响 JSON 提取。

{"title":"标题","content":"正文"}
`);

  assertEquals(result, '{"title":"标题","content":"正文"}');
});

Deno.test("cleanLLMText strips think tags, fences and wrapping quotes", () => {
  const result = cleanLLMText(`
\`\`\`text
<think>内部分析</think>
"今日 AI 速递"
\`\`\`
`);

  assertEquals(result, "今日 AI 速递");
});

Deno.test("stripMarkdownFence handles language fences", () => {
  assertEquals(stripMarkdownFence('```json\n{"ok":true}\n```'), '{"ok":true}');
});

Deno.test("normalizeLLMResponse cleans assistant message content", () => {
  const response = {
    choices: [{
      message: {
        content: "```text\n<think>推理</think>\n最终答案\n```",
      },
    }],
  };

  normalizeLLMResponse(response);

  assertEquals(response.choices[0].message.content, "最终答案");
});
