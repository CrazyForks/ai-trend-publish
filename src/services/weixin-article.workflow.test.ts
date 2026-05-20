import { assertEquals } from "@std/assert";
import {
  buildFallbackSummaryTitle,
  formatSummaryTitle,
  getCoverTitle,
} from "./weixin-article/article-title.service.ts";

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
  assertEquals(title.includes("AI速递 | AI趋势速递"), true);
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
