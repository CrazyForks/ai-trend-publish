import { existsSync } from "node:fs";
import process from "node:process";
import dotenv from "npm:dotenv";

dotenv.config();

type CheckStatus = "pass" | "warn" | "fail";

interface CheckResult {
  status: CheckStatus;
  group: string;
  name: string;
  detail: string;
}

interface FeatureCheck {
  group: string;
  name: string;
  enabled: boolean;
  required?: string[];
  anyOf?: string[];
  optional?: string[];
  detail: string;
}

const results: CheckResult[] = [];

const PLACEHOLDER_VALUES = new Set([
  "change-me",
  "your_api_key",
  "your-api-key",
  "your_app_id",
  "your-app-id",
  "your_app_secret",
  "your-app-secret",
  "your_key",
  "your_name",
  "your_webhook_url",
  "your_feishu_webhook_url",
  "your_jina_api_key",
  "password",
]);

function add(
  status: CheckStatus,
  group: string,
  name: string,
  detail: string,
) {
  results.push({ status, group, name, detail });
}

function envValue(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function hasValue(key: string): boolean {
  const value = envValue(key);
  return value.length > 0 && !PLACEHOLDER_VALUES.has(value);
}

function boolEnv(key: string, fallback = false): boolean {
  const value = envValue(key).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function missing(keys: string[]): string[] {
  return keys.filter((key) => !hasValue(key));
}

function checkDenoVersion() {
  const version = Deno.version.deno;
  const major = Number(version.split(".")[0]);
  if (major >= 2) {
    add("pass", "运行环境", "Deno", `当前版本 ${version}`);
  } else {
    add(
      "fail",
      "运行环境",
      "Deno",
      `当前版本 ${version}，需要 v2.0.0 或更高版本`,
    );
  }
}

function checkFiles() {
  const files = [
    ".env",
    "src/modules/render/weixin/templates/article.minimal.ejs",
    "src/modules/render/weixin/templates/article.longform.ejs",
  ];

  for (const file of files) {
    add(
      existsSync(file) ? "pass" : "fail",
      "项目文件",
      file,
      existsSync(file) ? "文件存在" : "文件不存在",
    );
  }
}

function checkRequiredGroup(group: string, name: string, keys: string[]) {
  const missed = missing(keys);
  add(
    missed.length === 0 ? "pass" : "fail",
    group,
    name,
    missed.length === 0
      ? `已配置: ${keys.join(", ")}`
      : `缺少: ${missed.join(", ")}`,
  );
}

function checkFeature(feature: FeatureCheck) {
  if (!feature.enabled) {
    add("warn", feature.group, feature.name, `未开启。${feature.detail}`);
    return;
  }

  const requiredMissing = missing(feature.required ?? []);
  const hasAny = !feature.anyOf || feature.anyOf.some((key) => hasValue(key));

  if (requiredMissing.length > 0 || !hasAny) {
    const messages: string[] = [];
    if (requiredMissing.length > 0) {
      messages.push(`缺少: ${requiredMissing.join(", ")}`);
    }
    if (!hasAny && feature.anyOf) {
      messages.push(`至少配置一个: ${feature.anyOf.join(" 或 ")}`);
    }
    add("fail", feature.group, feature.name, messages.join("；"));
    return;
  }

  const optionalMissing = missing(feature.optional ?? []);
  add(
    optionalMissing.length > 0 ? "warn" : "pass",
    feature.group,
    feature.name,
    optionalMissing.length > 0
      ? `可用，但可选项未配置: ${optionalMissing.join(", ")}`
      : `可用。${feature.detail}`,
  );
}

function checkTemplateConfig() {
  const template = envValue("ARTICLE_TEMPLATE_TYPE") || "default";
  const supported = [
    "default",
    "modern",
    "tech",
    "mianpro",
    "longform",
    "product",
    "minimal",
    "darktech",
    "dynamic",
    "random",
  ];
  add(
    supported.includes(template) ? "pass" : "fail",
    "微信文章",
    "ARTICLE_TEMPLATE_TYPE",
    supported.includes(template)
      ? `当前模板: ${template}`
      : `不支持的模板: ${template}。可选: ${supported.join(", ")}`,
  );
}

function checkConfig() {
  checkRequiredGroup("基础必填", "API 鉴权", ["SERVER_API_KEY"]);
  checkRequiredGroup("基础必填", "LLM", [
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_MODEL",
  ]);

  const dryRun = boolEnv("DRY_RUN", false);
  checkFeature({
    group: "微信发布",
    name: dryRun ? "微信公众号配置(dry-run)" : "微信公众号配置",
    enabled: true,
    required: dryRun ? [] : ["WEIXIN_APP_ID", "WEIXIN_APP_SECRET"],
    optional: dryRun ? ["WEIXIN_APP_ID", "WEIXIN_APP_SECRET"] : [],
    detail: dryRun
      ? "DRY_RUN=true 时不会正式发布；配置公众号 key 后可更接近正式链路。"
      : "正式发布必须配置公众号 app id 和 secret。",
  });

  checkTemplateConfig();

  checkFeature({
    group: "内容抓取",
    name: "文章抓取源",
    enabled: true,
    anyOf: ["FIRE_CRAWL_API_KEY", "X_API_BEARER_TOKEN", "XQUIK_API_KEY"],
    detail: "文章工作流至少需要 FireCrawl 或 Twitter/X 抓取源之一。",
  });

  checkFeature({
    group: "封面生图",
    name: "阿里云百炼 / DashScope",
    enabled: hasValue("DASHSCOPE_API_KEY"),
    required: ["DASHSCOPE_API_KEY"],
    detail: "未配置时封面生成会走本地兜底图，不影响发布主流程。",
  });

  checkFeature({
    group: "内容去重",
    name: "向量去重",
    enabled: boolEnv("ENABLE_DEDUPLICATION", false),
    required: [
      "DASHSCOPE_EMBEDDING_BASE_URL",
      "DASHSCOPE_EMBEDDING_API_KEY",
      "DASHSCOPE_EMBEDDING_MODEL",
      "DB_HOST",
      "DB_PORT",
      "DB_USER",
      "DB_PASSWORD",
      "DB_DATABASE",
    ],
    detail: "开启后会用 embedding 计算相似度，并把向量写入数据库。",
  });

  checkFeature({
    group: "数据库",
    name: "MySQL",
    enabled: boolEnv("ENABLE_DB", false),
    required: ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_DATABASE"],
    detail: "用于从数据库读取数据源配置，以及保存向量去重数据。",
  });

  checkFeature({
    group: "通知",
    name: "Bark",
    enabled: boolEnv("ENABLE_BARK", false),
    required: ["BARK_URL"],
    detail: "工作流开始、失败、完成通知。",
  });
  checkFeature({
    group: "通知",
    name: "钉钉",
    enabled: boolEnv("ENABLE_DINGDING", false),
    required: ["DINGDING_WEBHOOK"],
    detail: "工作流开始、失败、完成通知。",
  });
  checkFeature({
    group: "通知",
    name: "飞书",
    enabled: boolEnv("ENABLE_FEISHU", false),
    required: ["FEISHU_WEBHOOK_URL"],
    detail: "工作流开始、失败、完成通知。",
  });
}

function printResults() {
  const icon: Record<CheckStatus, string> = {
    pass: "OK",
    warn: "WARN",
    fail: "FAIL",
  };
  const groupOrder = Array.from(new Set(results.map((result) => result.group)));

  console.log("TrendPublish 配置体检\n");
  for (const group of groupOrder) {
    console.log(`# ${group}`);
    for (const result of results.filter((item) => item.group === group)) {
      console.log(`[${icon[result.status]}] ${result.name} - ${result.detail}`);
    }
    console.log("");
  }

  const failed = results.filter((result) => result.status === "fail").length;
  const warned = results.filter((result) => result.status === "warn").length;
  console.log(`结果: ${failed} 个失败，${warned} 个提醒`);

  if (failed > 0) {
    Deno.exit(1);
  }
}

checkDenoVersion();
checkFiles();
checkConfig();
printResults();
