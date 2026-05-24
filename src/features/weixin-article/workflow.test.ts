import { assertEquals } from "@std/assert";
import {
  buildFallbackSummaryTitle,
  buildSummaryTitle,
  formatSummaryTitle,
  getCoverTitle,
} from "./services/article-title.service.ts";

Deno.test("getCoverTitle extracts title after workflow prefix", () => {
  assertEquals(
    getCoverTitle("2026/5/20 AI速递 | 模型产品化进入新阶段"),
    "模型产品化进入新阶段",
  );
});

Deno.test("getCoverTitle falls back when generated title is empty", () => {
  assertEquals(getCoverTitle("2026/5/20 AI速递 | "), "AI趋势速递");
});

Deno.test("getCoverTitle handles titles without separator", () => {
  assertEquals(getCoverTitle("AI开发工具更新"), "AI开发工具更新");
});

Deno.test("formatSummaryTitle falls back when title is empty", () => {
  const title = formatSummaryTitle("");
  assertEquals(title, "今日 AI 趋势观察");
});

Deno.test("buildFallbackSummaryTitle uses first available article title", () => {
  const title = buildFallbackSummaryTitle([
    {
      id: "1",
      title: "",
      content: "",
      url: "",
      publishDate: "",
      metadata: {},
    },
    {
      id: "2",
      title: "模型产品化进入新阶段 | 来源",
      content: "",
      url: "",
      publishDate: "",
      metadata: {},
    },
  ]);

  assertEquals(title, "模型产品化进入新阶段");
});

Deno.test("buildSummaryTitle prefers article plan title direction", () => {
  const title = buildSummaryTitle([
    {
      id: "1",
      title: "普通新闻标题",
      content: "",
      url: "",
      publishDate: "",
      metadata: {},
    },
  ], {
    articlePlan: {
      generatedAt: "",
      fallback: false,
      format: "product-review",
      thesis: "Google I/O 2026 转向 Agent 工具链",
      targetReader: "",
      summary: "",
      sections: [],
      titleDirections: [{
        title: "Google I/O 2026：Agent 工具链进入产品化阶段",
        angle: "产品化",
        reason: "贴合文章主线",
      }],
      coverDirection: { visualBrief: "", textBrief: "", mood: "" },
      bodyImagePlan: { enabled: false, placements: [] },
      riskNotes: [],
      sourceArticleIds: [],
    },
  });

  assertEquals(title, "Google I/O 2026：Agent 工具链进入产品化阶段");
});

Deno.test("buildSummaryTitle removes fixed daily brief prefix and avoids broken word truncation", () => {
  const title = buildSummaryTitle([
    {
      id: "1",
      title:
        "5/24/2026 AI速递 | Google I/O 2026：Gemini 与开发者工具链的产品化转向",
      content: "",
      url: "",
      publishDate: "",
      metadata: {},
    },
  ]);

  assertEquals(
    title,
    "Google I/O 2026：Gemini 与开发者工具链的产品化转向",
  );
});
