import { assertEquals, assertThrows } from "@std/assert";
import { parseRankingResult } from "./ai.content-ranker.ts";

Deno.test("parseRankingResult strips closed think tags", () => {
  const result = parseRankingResult(`
<think>
这里是模型推理过程，不应该进入排序解析。
我会给 article-1 更高分。
</think>
文章ID: article-1: 92.5
文章ID: article-2: 81
`);

  assertEquals(result, [
    { id: "article-1", score: 92.5 },
    { id: "article-2", score: 81 },
  ]);
});

Deno.test("parseRankingResult handles unclosed think tags before rankings", () => {
  const result = parseRankingResult(`
<think>
模型没有闭合思考标签，但后面已经开始输出结果。
article-1: 90
article-2: 76.5
`);

  assertEquals(result, [
    { id: "article-1", score: 90 },
    { id: "article-2", score: 76.5 },
  ]);
});

Deno.test("parseRankingResult skips unclosed think analysis before final rankings", () => {
  const result = parseRankingResult(`
<think>让我分析这两篇文章：

**文章1 (fc_1779266592715_9_230709837):**
- 标题：Remove-AI-Watermarks
- 内容：介绍命令行工具

**文章2 (tw_1779266592715_1):**
- 标题：新模型发布
- 内容：具备新闻价值

最终评分：
fc_1779266592715_9_230709837: 73
tw_1779266592715_1: 91.5
`);

  assertEquals(result, [
    { id: "fc_1779266592715_9_230709837", score: 73 },
    { id: "tw_1779266592715_1", score: 91.5 },
  ]);
});

Deno.test("parseRankingResult ignores fences and prose around rankings", () => {
  const result = parseRankingResult(`
下面是评分：
\`\`\`text
- 文章ID: foo 分数: 88
- bar：77.5
\`\`\`
`);

  assertEquals(result, [
    { id: "foo", score: 88 },
    { id: "bar", score: 77.5 },
  ]);
});

Deno.test("parseRankingResult rejects responses without rankings", () => {
  assertThrows(
    () => parseRankingResult("<think>只有推理，没有结果</think>"),
    Error,
    "未解析到有效的评分结果",
  );
});
