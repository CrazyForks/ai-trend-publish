import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createTheme, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  Eye,
  FileJson,
  FileText,
  Globe2,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Newspaper,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Workflow,
  XCircle,
} from "lucide-react";
import { ArticleQualityShell } from "./components/article-quality-shell.tsx";
import { ArticleWorkbenchHome } from "./components/article-workbench-home.tsx";
import { LoginView } from "./components/login-view.tsx";
import { FeatureNav, Sidebar } from "./components/shell/navigation.tsx";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricChip,
  SectionTitle,
  Select,
  Textarea,
} from "./components/ui.tsx";
import { type DashboardView, VIEW_META } from "./dashboard/views.ts";
import "./styles.css";

const theme = createTheme({
  primaryColor: "blue",
  fontFamily:
    "Inter, IBM Plex Sans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  defaultRadius: "md",
  headings: {
    fontWeight: "650",
  },
  components: {
    Button: {
      defaultProps: {
        radius: "md",
      },
    },
    Card: {
      defaultProps: {
        radius: "md",
        withBorder: true,
      },
    },
  },
});

type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

interface ArtifactRef {
  store: string;
  key: string;
  contentType: string;
  label?: string;
  size?: number;
  checksum?: string;
}

interface ArticleRunRecord {
  runId: string;
  mode: string;
  status: RunStatus;
  dryRun: boolean;
  trigger: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
  artifacts: ArtifactRef[];
}

interface ArticleRunStepRecord {
  runId: string;
  name: string;
  status: StepStatus;
  attempt: number;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  inputArtifacts?: ArtifactRef[];
  outputArtifacts?: ArtifactRef[];
  error?: string;
}

interface ArticleRunDetail extends ArticleRunRecord {
  steps: ArticleRunStepRecord[];
}

interface HealthResponse {
  ok: boolean;
  mode: string;
  timestamp: string;
  checks: Record<string, { ok: boolean; detail: string }>;
}

interface ConfigSummary {
  mode: string;
  article: {
    dryRunDefault: boolean;
    count: number;
    sourcesCount: number;
    renderer: {
      template: string;
      promptProfile: string;
    };
    publisher: {
      provider: string;
    };
    cover: {
      enabled: boolean;
      provider: string;
      model: string;
    };
    bodyImages: {
      mode: string;
      provider: string;
      model: string;
      count: number;
      size: string;
    };
    deduplication: {
      enabled: boolean;
      embeddingProvider: string;
      vectorStore: string;
    };
    notifications: {
      channels: string[];
    };
    qualityGate: {
      enabled: boolean;
      minScore: number;
      blockOnHighFactIssue: boolean;
      allowForcePublish: boolean;
      maxRevisionRounds: number;
    };
  };
  storage: {
    artifacts: string;
    runState: string;
    runtimeConfig: string;
    vector: string;
  };
  fetchGroups: string[];
  providersConfigured: Record<string, boolean>;
  observability: {
    enabled: boolean;
    sinks: string[];
  };
}

interface CapabilityProfile {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  provider: string;
  config: Record<string, unknown>;
  version: number;
  isDefault: boolean;
}

interface RuntimeFeatureProfile {
  id: string;
  featureKey: string;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  config: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface RuntimeArticleSource {
  id: string;
  profileId: string;
  raw: string;
  url: string;
  group: string;
  enabled: boolean;
  position: number;
}

interface RuntimeSchedule {
  id: string;
  featureKey: string;
  profileId: string;
  name: string;
  enabled: boolean;
  cron: string;
  timezone: string;
  dryRun: boolean;
}

interface SourceDraft {
  raw: string;
  url: string;
  group: string;
  enabled: boolean;
}

interface FetchGroupDraft {
  name: string;
  providers: string[];
}

interface ArticleFormDraft {
  count: string;
  dryRun: boolean;
  template: string;
  promptProfile: string;
  llmProfileId: string;
  publisherProvider: string;
  coverEnabled: boolean;
  coverImageProfileId: string;
  coverModel: string;
  bodyImagesMode: string;
  bodyImageProfileId: string;
  bodyImageCount: string;
  bodyImageSize: string;
  dedupEnabled: boolean;
  embeddingProfileId: string;
  vectorStore: string;
  notificationProfileId: string;
  qualityGateEnabled: boolean;
  qualityGateMinScore: string;
  qualityGateBlockOnHighFactIssue: boolean;
  qualityGateAllowForcePublish: boolean;
  qualityGateMaxRevisionRounds: string;
}

interface CapabilityFormDraft {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  provider: string;
  model: string;
  count: string;
  size: string;
  channels: string[];
}

type TopicRecommendation = "lead" | "brief" | "skip" | "watch";

interface TopicCluster {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  articleIds: string[];
  primaryArticleId: string;
  sourceCount: number;
  freshness: number;
  confidence: number;
}

interface TopicScore {
  topicId: string;
  novelty: number;
  relevance: number;
  impact: number;
  evidence: number;
  actionability: number;
  saturation: number;
  risk: number;
  finalScore: number;
  reason: string;
  recommendedUse: TopicRecommendation;
}

interface EditorialTopicReport {
  generatedAt: string;
  fallback: boolean;
  error?: string;
  clusters: TopicCluster[];
  scores: TopicScore[];
}

interface EditorialDecision {
  generatedAt: string;
  fallback: boolean;
  error?: string;
  leadTopicId: string;
  leadTopicTitle: string;
  decisionSummary: string;
  whyThisNow: string[];
  selectedTopics: Array<{
    topicId: string;
    role: "lead" | "supporting" | "watch";
    reason: string;
  }>;
  skippedTopics: Array<{
    topicId: string;
    reason: string;
  }>;
  duplicationRisk: {
    level: "low" | "medium" | "high";
    reason: string;
    avoidAngles: string[];
  };
  sourceJudgements: Array<{
    url: string;
    role: "primary" | "supporting" | "reference-only" | "avoid";
    reason: string;
  }>;
  recommendedFormat: string;
  writingDirectives: string[];
  titleWarnings: string[];
}

interface SourceHealthFailure {
  provider: string;
  message: string;
}

interface SourceHealthRecord {
  raw: string;
  url: string;
  group: string;
  providers: string[];
  status: "succeeded" | "failed" | "empty";
  selectedProvider?: string;
  articleCount: number;
  durationMs: number;
  failures: SourceHealthFailure[];
}

interface SourceHealthReport {
  generatedAt: string;
  totalSources: number;
  succeeded: number;
  failed: number;
  empty: number;
  totalArticles: number;
  records: SourceHealthRecord[];
}

interface SourcePerformanceRecord {
  url: string;
  group: string;
  runs: number;
  successes: number;
  failures: number;
  empty: number;
  totalArticles: number;
  lastStatus: "succeeded" | "failed" | "empty";
  lastProvider?: string;
  lastError?: string;
  lastRunId?: string;
  updatedAt: string;
}

interface EditorialMemoryContext {
  recentArticles: Array<{
    title: string;
    thesis?: string;
    qualityScore?: number;
    publishStatus: string;
    createdAt: string;
  }>;
  sourcePerformance: SourcePerformanceRecord[];
  recentFeedback: EditorialRunFeedback[];
}

type EditorialFeedbackRating = "good" | "ok" | "bad";

interface EditorialRunFeedback {
  runId: string;
  profileId?: string;
  rating: EditorialFeedbackRating;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

interface ArticlePlanSection {
  id: string;
  title: string;
  intent: string;
  angle: string;
  articleIds: string[];
  keyPoints: string[];
}

interface ArticlePlan {
  generatedAt: string;
  fallback: boolean;
  error?: string;
  format: string;
  thesis: string;
  targetReader: string;
  summary: string;
  sections: ArticlePlanSection[];
  titleDirections: Array<{
    title: string;
    angle: string;
    reason: string;
  }>;
  coverDirection: {
    visualBrief: string;
    textBrief: string;
    mood: string;
  };
  bodyImagePlan: {
    enabled: boolean;
    placements: Array<{
      sectionId: string;
      purpose: string;
      promptHint: string;
    }>;
  };
  riskNotes: Array<{
    level: "low" | "medium" | "high";
    issue: string;
    handling: string;
  }>;
  sourceArticleIds: string[];
}

interface ArticleQualityReview {
  generatedAt: string;
  fallback: boolean;
  error?: string;
  overallScore: number;
  allowPublish: boolean;
  recommendedAction: string;
  summary: string;
  dimensionScores: Record<string, number>;
  issues: Array<{
    id: string;
    category: string;
    severity: "low" | "medium" | "high" | "blocker";
    message: string;
    evidence?: string;
    suggestion: string;
    autoFixable: boolean;
  }>;
  repairSuggestions: string[];
}

interface PublishArtifactResult {
  publishId: string;
  status: string;
  platform: string;
  url?: string;
  reason?: string;
}

interface ArticleRuntimeProfileDetail {
  profile: RuntimeFeatureProfile;
  article: Record<string, unknown>;
  sources: RuntimeArticleSource[];
  fetchGroups: Record<string, string[]>;
  schedule: RuntimeSchedule | null;
}

interface ApiErrorPayload {
  error?: string | { message?: string; data?: { error?: string } };
}

const API_KEY_STORAGE = "trendpublish.dashboard.apiKey";
const AUTO_REFRESH_MS = 8000;
const FETCH_PROVIDER_OPTIONS = [
  "auto",
  "firecrawl",
  "jina",
  "jina-search",
  "brave-search",
  "tavily-search",
  "exa-search",
  "serper-search",
  "newsapi",
  "gdelt",
  "hackernews",
  "arxiv",
  "twitter",
  "rss",
];
const TEMPLATE_OPTIONS = [
  "minimal",
  "dynamic",
  "modern",
  "longform",
  "product",
  "tech",
  "mianpro",
  "darktech",
  "default",
  "random",
];
const PROMPT_PROFILE_OPTIONS = [
  "technology",
  "general",
  "business",
  "product",
  "developer",
  "research",
];
const BODY_IMAGE_MODE_OPTIONS = [
  { value: "off", label: "关闭" },
  { value: "missing", label: "缺图时生成" },
  { value: "all", label: "每篇都生成" },
];
const CAPABILITY_KIND_OPTIONS = [
  "llm",
  "image-generation",
  "notification",
  "fetch-strategy",
  "embedding",
];
const NOTIFICATION_CHANNEL_OPTIONS = ["bark", "dingtalk", "feishu"];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatDuration(ms?: number) {
  if (ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatSize(size?: number) {
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function statusTone(status: RunStatus | StepStatus) {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "running" || status === "queued") return "info";
  return "muted";
}

function statusIcon(status: RunStatus | StepStatus) {
  if (status === "succeeded") return <CheckCircle2 className="size-4" />;
  if (status === "failed" || status === "cancelled") {
    return <XCircle className="size-4" />;
  }
  if (status === "running") return <Loader2 className="size-4 animate-spin" />;
  return <Clock3 className="size-4" />;
}

function artifactIcon(contentType: string) {
  if (contentType.includes("image/")) return <ImageIcon className="size-4" />;
  if (contentType.includes("json")) return <FileJson className="size-4" />;
  return <FileText className="size-4" />;
}

async function parseError(response: Response) {
  const text = await response.text();
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const parsed = JSON.parse(text) as ApiErrorPayload;
    if (typeof parsed.error === "string") return parsed.error;
    return parsed.error?.message ?? parsed.error?.data?.error ?? text;
  } catch {
    return text;
  }
}

function explainError(message?: string) {
  if (!message) return "";
  const lower = message.toLowerCase();
  if (message.includes("IP白名单") || lower.includes("whitelist")) {
    return "微信公众号 IP 白名单不包含当前服务器。远程发布建议走 weixin-relay，固定 IP 机器直连微信。";
  }
  if (
    message.includes("标题生成结果为空") ||
    message.includes("未获取到有效的标题")
  ) {
    return "大模型没有返回可用标题。可以降低模型温度、换模型，或先使用本地标题兜底继续 dry-run。";
  }
  if (message.includes("图片生成任务失败") || message.includes("封面生成")) {
    return "图片生成供应商返回失败。检查图片 provider 的 API Key、模型名、额度和返回 URL 是否可下载。";
  }
  if (message.includes("未解析到有效的评分结果")) {
    return "排序模型输出格式不符合要求，常见原因是模型输出了推理内容或没有按“文章ID: 分数”返回。";
  }
  if (message.includes("数据源") || message.includes("抓取")) {
    return "数据源抓取失败。检查 URL、fetchGroups、对应 provider 凭证和网络可访问性。";
  }
  if (lower.includes("unauthorized") || message.includes("未授权")) {
    return "认证失败。确认 Dashboard/API 使用的是 server.apiKey。";
  }
  return "";
}

async function apiJson<T>(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return await response.json() as T;
}

async function apiArtifact(path: string, apiKey: string): Promise<Response> {
  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response;
}

function WorkflowCommand(
  { health, config, latestRun }: {
    health: HealthResponse | null;
    config: ConfigSummary | null;
    latestRun: ArticleRunRecord | undefined;
  },
) {
  const bodyImageMode = config?.article.bodyImages.mode ?? "off";
  const stages = [
    {
      label: "Source",
      value: `${config?.article.sourcesCount ?? 0} URLs`,
      detail: config?.fetchGroups?.length
        ? config.fetchGroups.slice(0, 2).join(" / ")
        : "default group",
      icon: <Globe2 className="size-4" />,
    },
    {
      label: "Rank",
      value: config?.article.renderer.promptProfile ?? "technology",
      detail: "LLM scoring",
      icon: <SlidersHorizontal className="size-4" />,
    },
    {
      label: "Compose",
      value: config?.article.renderer.template ?? "minimal",
      detail: bodyImageMode === "off"
        ? "no body images"
        : `${bodyImageMode} images`,
      icon: <Newspaper className="size-4" />,
    },
    {
      label: "Publish",
      value: config?.article.publisher.provider ?? "-",
      detail: config?.article.dryRunDefault ? "dry-run default" : "draft mode",
      icon: <Rocket className="size-4" />,
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px]">
      <section className="tp-command rounded-lg border p-5">
        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#cbd5e1] bg-[#ffffff]/70 px-2.5 py-1 text-xs font-medium text-[#1d4ed8]">
              <CircleDot className="size-3.5 fill-[#f38020]/20" />
              Weixin article workflow
            </div>
            <h2 className="text-[28px] font-semibold leading-tight text-[#0f172a] lg:text-[34px]">
              从指定 Source 到可发布的微信文章草稿
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#6c6358]">
              自动抓取、去重、排序、润色、配图和渲染。Dashboard
              只暴露运行所需的关键控制，高级配置放到 Settings。
            </p>
          </div>

          <div className="grid min-w-[220px] gap-2 rounded-lg border border-[#dfd3bf] bg-[#ffffff]/62 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#64748b]">Environment</span>
              <Badge tone={health?.ok ? "success" : "muted"}>
                {health?.mode ?? config?.mode ?? "unknown"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#64748b]">Storage</span>
              <span className="truncate text-xs font-medium text-[#0f172a]">
                {config?.storage.runState ?? "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#64748b]">Images</span>
              <span className="truncate text-xs font-medium text-[#0f172a]">
                {config?.article.cover.enabled
                  ? config.article.cover.provider
                  : "cover off"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          {stages.map((stage, index) => (
            <div
              key={stage.label}
              className="group rounded-lg border border-[#dfd3bf] bg-[#ffffff]/58 p-3 transition hover:-translate-y-0.5 hover:bg-[#ffffff]"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="tp-icon-tile grid size-8 place-items-center rounded-md">
                  {stage.icon}
                </div>
                <span className="text-[11px] font-medium text-[#2563eb]">
                  0{index + 1}
                </span>
              </div>
              <div className="text-sm font-semibold text-[#0f172a]">
                {stage.label}
              </div>
              <div className="mt-1 truncate text-sm text-[#1e293b]">
                {stage.value}
              </div>
              <div className="mt-1 truncate text-xs text-[#64748b]">
                {stage.detail}
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="tp-ink-panel rounded-lg border border-[#1e293b] p-5">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-[#b7aa95]">
              Latest run
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {latestRun?.status ?? "idle"}
            </div>
          </div>
          <div className="grid size-10 place-items-center rounded-lg bg-[#ffffff]/10 text-[#bfdbfe]">
            {statusIcon(latestRun?.status ?? "queued")}
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4 border-b border-[#ffffff]/10 pb-3">
            <span className="text-[#cbd5e1]">Trigger</span>
            <span className="font-medium">{latestRun?.trigger ?? "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-[#ffffff]/10 pb-3">
            <span className="text-[#cbd5e1]">Mode</span>
            <span className="font-medium">
              {latestRun?.dryRun ? "dry-run" : "publish"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#cbd5e1]">Updated</span>
            <span className="font-medium">
              {latestRun ? formatDate(latestRun.updatedAt) : "waiting"}
            </span>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 rounded-lg bg-[#ffffff]/8 p-3">
          <div>
            <div className="text-xs text-[#cbd5e1]">Artifacts</div>
            <div className="mt-0.5 text-sm font-medium">
              {latestRun?.artifacts?.length ?? 0} files
            </div>
          </div>
          <ArrowUpRight className="size-4 text-[#bfdbfe]" />
        </div>
      </aside>
    </div>
  );
}

function _Overview(
  { health, config, latestRun }: {
    health: HealthResponse | null;
    config: ConfigSummary | null;
    latestRun: ArticleRunRecord | undefined;
  },
) {
  const checks = health ? Object.entries(health.checks) : [];
  const metricCards = [
    {
      label: "Sources",
      value: `${config?.article.sourcesCount ?? 0}`,
      detail: "指定 URL 与抓取分组",
      icon: <Globe2 className="size-5" />,
    },
    {
      label: "Template",
      value: config?.article.renderer.template ?? "-",
      detail: config?.article.renderer.promptProfile ?? "prompt profile",
      icon: <Workflow className="size-5" />,
    },
    {
      label: "Latest run",
      value: latestRun?.status ?? "idle",
      detail: latestRun ? formatDate(latestRun.updatedAt) : "等待第一次运行",
      icon: statusIcon(latestRun?.status ?? "queued"),
    },
    {
      label: "Storage",
      value: config?.storage.runState ?? "-",
      detail: config?.storage.artifacts
        ? `artifacts: ${config.storage.artifacts}`
        : "运行产物存储",
      icon: <Database className="size-5" />,
    },
    {
      label: "Logs",
      value: config?.observability.enabled
        ? `${config.observability.sinks.length || 0} sinks`
        : "off",
      detail: config?.observability.sinks.length
        ? config.observability.sinks.join(" / ")
        : "logger observability",
      icon: <Bell className="size-5" />,
    },
  ];

  return (
    <div className="space-y-4">
      <WorkflowCommand health={health} config={config} latestRun={latestRun} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((metric) => (
          <Metric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            icon={metric.icon}
          />
        ))}
      </div>

      <NextStepGuide config={config} latestRun={latestRun} />

      <div className="grid gap-3 xl:grid-cols-[1fr_0.8fr_0.9fr]">
        <Card>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="tp-title text-base font-semibold">运行环境</h2>
              <p className="tp-muted mt-1 text-sm">
                Dashboard 只展示脱敏配置、运行状态和产物入口
              </p>
            </div>
            {health && (
              <Badge tone={health.ok ? "success" : "danger"}>
                {health.ok ? "healthy" : "unhealthy"}
              </Badge>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricLine
              label="模式"
              value={health?.mode ?? config?.mode ?? "-"}
            />
            <MetricLine
              label="默认发布"
              value={config?.article.dryRunDefault ? "dry-run" : "创建草稿"}
            />
            <MetricLine
              label="正文配图"
              value={`${config?.article.bodyImages.mode ?? "off"} · ${
                config?.article.bodyImages.model ?? "-"
              }`}
            />
            <MetricLine
              label="封面"
              value={config?.article.cover.enabled
                ? config.article.cover.model
                : "off"}
            />
            <MetricLine
              label="日志观测"
              value={config?.observability.enabled
                ? (config.observability.sinks.join(" / ") || "enabled")
                : "off"}
            />
          </div>
        </Card>

        <ProviderReadiness config={config} />

        <Card>
          <h2 className="tp-title mb-4 text-base font-semibold">健康检查</h2>
          {checks.length
            ? (
              <div className="space-y-2.5">
                {checks.map(([name, check]) => (
                  <div className="flex items-start gap-3" key={name}>
                    <div
                      className={cx(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-md",
                        check.ok
                          ? "bg-[#ecfdf5] text-[#047857]"
                          : "bg-[#fef2f2] text-[#9a3412]",
                      )}
                    >
                      {check.ok
                        ? <CheckCircle2 className="size-4" />
                        : <AlertCircle className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="tp-title text-sm font-medium">{name}</div>
                      <div className="tp-muted break-words text-xs">
                        {check.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
            : <EmptyState>还没有健康检查结果</EmptyState>}
        </Card>
      </div>
    </div>
  );
}

function NextStepGuide(
  { config, latestRun }: {
    config: ConfigSummary | null;
    latestRun: ArticleRunRecord | undefined;
  },
) {
  const steps = [
    {
      title: "1. 配数据源",
      detail: config?.article.sourcesCount
        ? `当前已有 ${config.article.sourcesCount} 个 Source`
        : "先到 Sources 添加 URL，普通网页直接粘贴即可。",
      done: Boolean(config?.article.sourcesCount),
    },
    {
      title: "2. 跑 dry-run",
      detail: latestRun
        ? `最近一次是 ${
          latestRun.dryRun ? "dry-run" : "publish"
        } · ${latestRun.status}`
        : "点击右上角运行，默认 dry-run，不会创建微信草稿。",
      done: Boolean(latestRun),
    },
    {
      title: "3. 看产物和错误",
      detail: latestRun?.artifacts?.length
        ? `已有 ${latestRun.artifacts.length} 个产物，可到 Artifacts 预览。`
        : "运行后在 Runs 看步骤，在 Artifacts 看 HTML 和 JSON。",
      done: Boolean(latestRun?.artifacts?.length),
    },
    {
      title: "4. 再正式发布",
      detail: "确认正文、封面、配图都正常后，再用二次确认创建微信草稿。",
      done: !config?.article.dryRunDefault,
    },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="tp-title text-base font-semibold">下一步</h2>
          <p className="tp-muted mt-1 text-sm">
            按这个顺序跑，最容易定位配置和内容问题。
          </p>
        </div>
        <Badge tone={latestRun?.status === "failed" ? "danger" : "muted"}>
          {latestRun?.status ?? "not started"}
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map((step) => (
          <div
            key={step.title}
            className="rounded-md border border-[#e2e8f0] bg-[#ffffff]/55 p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cx(
                  "grid size-5 place-items-center rounded-full",
                  step.done
                    ? "bg-[#e8f1e5] text-[#047857]"
                    : "bg-[#eff6ff] text-[#64748b]",
                )}
              >
                {step.done ? <CheckCircle2 className="size-3.5" /> : null}
              </span>
              <div className="tp-title text-sm font-semibold">
                {step.title}
              </div>
            </div>
            <div className="tp-muted text-xs leading-5">{step.detail}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProviderReadiness({ config }: { config: ConfigSummary | null }) {
  const providers = config?.providersConfigured ?? {};
  const groups = [
    {
      title: "AI",
      items: [
        { name: "大模型", configured: providers.ai },
        { name: "Embedding", configured: providers.embedding },
      ],
    },
    {
      title: "抓取",
      items: [
        { name: "FireCrawl", configured: providers.firecrawl },
        { name: "Jina", configured: providers.jina },
        { name: "Brave Search", configured: providers.braveSearch },
        { name: "Tavily", configured: providers.tavilySearch },
        { name: "Exa", configured: providers.exaSearch },
        { name: "Serper", configured: providers.serperSearch },
        { name: "NewsAPI", configured: providers.newsapi },
        { name: "GDELT", configured: providers.gdelt },
        { name: "Hacker News", configured: providers.hackernews },
        { name: "arXiv", configured: providers.arxiv },
        { name: "Twitter/X", configured: providers.twitter },
        { name: "RSS", configured: providers.rss },
      ],
    },
    {
      title: "发布与图片",
      items: [
        { name: "微信直连", configured: providers.weixin },
        { name: "微信 Relay", configured: providers.weixinRelay },
        { name: "阿里云图片", configured: providers.dashscopeImage },
        { name: "MiniMax 图片", configured: providers.minimaxImage },
      ],
    },
    {
      title: "通知",
      items: [
        { name: "Bark", configured: providers.bark },
        { name: "钉钉", configured: providers.dingtalk },
        { name: "飞书", configured: providers.feishu },
      ],
    },
  ];

  return (
    <Card>
      <h2 className="tp-title mb-4 text-base font-semibold">Provider 状态</h2>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="tp-muted mb-1.5 text-xs font-medium">
              {group.title}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item) => (
                <Badge
                  key={item.name}
                  tone={item.configured ? "success" : "muted"}
                >
                  {item.configured ? <CheckCircle2 className="size-3" /> : null}
                  {item.name}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Metric(
  { label, value, detail, icon }: {
    label: string;
    value: string;
    detail?: string;
    icon?: React.ReactNode;
  },
) {
  return (
    <Card className="group p-4 transition hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <div className="tp-icon-tile grid size-9 shrink-0 place-items-center rounded-md">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="tp-muted text-xs">{label}</div>
          <div className="tp-title mt-1.5 truncate text-xl font-semibold">
            {value}
          </div>
          {detail && (
            <div className="mt-2 truncate text-xs text-[#64748b]">
              {detail}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="tp-card-soft rounded-md border p-3">
      <div className="tp-muted text-xs">{label}</div>
      <div className="tp-title mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function RunList(
  {
    runs,
    selectedRunId,
    onSelect,
    filter,
    setFilter,
    query,
    setQuery,
  }: {
    runs: ArticleRunRecord[];
    selectedRunId: string | null;
    onSelect: (runId: string) => void;
    filter: "all" | RunStatus;
    setFilter: (filter: "all" | RunStatus) => void;
    query: string;
    setQuery: (query: string) => void;
  },
) {
  const filtered = runs.filter((run) => {
    const matchStatus = filter === "all" || run.status === filter;
    const matchQuery = !query || run.runId.toLowerCase().includes(query);
    return matchStatus && matchQuery;
  });
  return (
    <Card className="p-0">
      <div className="border-b border-[#e2e8f0] p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="tp-title text-base font-semibold">
            运行记录
          </h2>
          <Badge>{runs.length}</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-[#94a3b8]" />
            <Input
              className="pl-9"
              placeholder="搜索 runId"
              value={query}
              onChange={(event) =>
                setQuery(event.currentTarget.value.toLowerCase())}
            />
          </label>
          <Select
            value={filter}
            onChange={(event) =>
              setFilter(event.currentTarget.value as RunStatus)}
          >
            <option value="all">全部状态</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
            <option value="cancelled">cancelled</option>
          </Select>
        </div>
      </div>
      <div className="tp-scrollbar max-h-[620px] overflow-auto p-2">
        {filtered.length
          ? filtered.map((run) => (
            <button
              type="button"
              key={run.runId}
              className={cx(
                "mb-1.5 w-full rounded-md border p-2.5 text-left transition",
                run.runId === selectedRunId
                  ? "border-[#0f172a] bg-[#f1e7d7]"
                  : "border-transparent hover:border-[#e2e8f0] hover:bg-[#f8fafc]",
              )}
              onClick={() => onSelect(run.runId)}
            >
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="tp-title min-w-0 truncate pr-1 text-sm font-medium">
                  {run.runId}
                </div>
                <div className="shrink-0">
                  <Badge tone={statusTone(run.status)} className="max-w-[86px]">
                    {statusIcon(run.status)}
                    {run.status}
                  </Badge>
                </div>
              </div>
              <div className="tp-muted text-xs">
                {run.mode} · {run.trigger} ·{" "}
                {run.dryRun ? "dry-run" : "publish"}
              </div>
              <div className="tp-subtle mt-1 text-xs">
                {formatDate(run.createdAt)}
              </div>
            </button>
          ))
          : <EmptyState>没有匹配的运行记录</EmptyState>}
      </div>
    </Card>
  );
}

function RunDetail(
  {
    run,
    apiKey,
    profileId,
    onPreviewArtifact,
  }: {
    run: ArticleRunDetail | null;
    apiKey: string;
    profileId: string;
    onPreviewArtifact: (artifact: ArtifactRef) => void;
  },
) {
  const artifacts = useMemo(() => collectArtifacts(run), [run]);

  if (!run) {
    return (
      <Card>
        <EmptyState>选择一条运行记录查看详情</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone={statusTone(run.status)}>
                {statusIcon(run.status)}
                {run.status}
              </Badge>
              <Badge>{run.dryRun ? "dry-run" : "publish"}</Badge>
            </div>
            <h2 className="tp-title break-all text-lg font-semibold">
              {run.runId}
            </h2>
            {run.summary && (
              <p className="tp-muted mt-3 whitespace-pre-wrap text-sm leading-6">
                {run.summary}
              </p>
            )}
            {run.error && (
              <div className="tp-danger mt-3 rounded-md border p-3 text-sm">
                {run.error}
                {explainError(run.error) && (
                  <div className="mt-2 border-t border-[#edc5b8] pt-2 text-xs leading-5">
                    {explainError(run.error)}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="tp-muted grid min-w-56 gap-1.5 text-xs">
            <div>创建：{formatDate(run.createdAt)}</div>
            <div>更新：{formatDate(run.updatedAt)}</div>
            <div>完成：{formatDate(run.finishedAt)}</div>
          </div>
        </div>
      </Card>

      <RunFeedbackPanel run={run} apiKey={apiKey} profileId={profileId} />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="tp-title text-base font-semibold">
            步骤时间线
          </h3>
          <Badge>{run.steps.length} steps</Badge>
        </div>
        {run.steps.length
          ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="tp-muted border-b border-[#e2e8f0] text-xs">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Step</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Attempt</th>
                    <th className="py-2 pr-4 font-medium">Duration</th>
                    <th className="py-2 pr-4 font-medium">Artifacts</th>
                  </tr>
                </thead>
                <tbody>
                  {run.steps.map((step, index) => (
                    <tr
                      key={`${step.name}-${index}`}
                      className="border-b border-[#eee5d4]"
                    >
                      <td className="tp-title py-2.5 pr-4 font-medium">
                        {step.name}
                        {step.error && (
                          <div className="mt-1 max-w-xl whitespace-pre-wrap text-xs font-normal text-[#b42318]">
                            {step.error}
                            {explainError(step.error) && (
                              <div className="mt-1 text-[#7b3f2f]">
                                {explainError(step.error)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={statusTone(step.status)}>
                          {statusIcon(step.status)}
                          {step.status}
                        </Badge>
                      </td>
                      <td className="tp-muted py-2.5 pr-4">
                        {step.attempt}
                      </td>
                      <td className="tp-muted py-2.5 pr-4">
                        {formatDuration(step.durationMs)}
                      </td>
                      <td className="tp-muted py-2.5 pr-4">
                        {(step.outputArtifacts?.length ?? 0) +
                          (step.inputArtifacts?.length ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
          : <EmptyState>这个 run 还没有 step 记录</EmptyState>}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="tp-title text-base font-semibold">
            产物
          </h3>
          <Badge>{artifacts.length}</Badge>
        </div>
        {artifacts.length
          ? (
            <div className="grid gap-2">
              {artifacts.map((artifact) => (
                <button
                  type="button"
                  className="flex items-center justify-between gap-3 rounded-md border border-[#e2e8f0] p-2.5 text-left transition hover:bg-[#f8fafc]"
                  key={artifact.key}
                  onClick={() => onPreviewArtifact(artifact)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-8 place-items-center rounded-md bg-[#eff6ff] text-[#2563eb]">
                      {artifactIcon(artifact.contentType)}
                    </div>
                    <div className="min-w-0">
                      <div className="tp-title truncate text-sm font-medium">
                        {artifact.label ?? artifact.key.split("/").pop()}
                      </div>
                      <div className="tp-muted truncate text-xs">
                        {artifact.key}
                      </div>
                    </div>
                  </div>
                  <div className="tp-muted hidden shrink-0 items-center gap-3 text-xs sm:flex">
                    <span>{artifact.contentType}</span>
                    <span>{formatSize(artifact.size)}</span>
                    <Eye className="size-4" />
                  </div>
                </button>
              ))}
            </div>
          )
          : <EmptyState>这个 run 暂无产物</EmptyState>}
      </Card>
    </div>
  );
}

function RunFeedbackPanel(
  { run, apiKey, profileId }: {
    run: ArticleRunDetail;
    apiKey: string;
    profileId: string;
  },
) {
  const [feedback, setFeedback] = useState<EditorialRunFeedback | null>(null);
  const [rating, setRating] = useState<EditorialFeedbackRating>("ok");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    apiJson<{ feedback: EditorialRunFeedback | null }>(
      `/api/runs/${encodeURIComponent(run.runId)}/feedback`,
      apiKey,
    )
      .then((data) => {
        setFeedback(data.feedback);
        setRating(data.feedback?.rating ?? "ok");
        setNote(data.feedback?.note ?? "");
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, [run.runId, apiKey]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const data = await apiJson<{ feedback: EditorialRunFeedback }>(
        `/api/runs/${encodeURIComponent(run.runId)}/feedback`,
        apiKey,
        {
          method: "PUT",
          body: JSON.stringify({
            rating,
            note,
            profileId,
          }),
        },
      );
      setFeedback(data.feedback);
      setRating(data.feedback.rating);
      setNote(data.feedback.note ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError("");
    try {
      await apiJson<{ deleted: boolean }>(
        `/api/runs/${encodeURIComponent(run.runId)}/feedback`,
        apiKey,
        { method: "DELETE" },
      );
      setFeedback(null);
      setRating("ok");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="tp-title text-base font-semibold">人工反馈</h3>
          <p className="tp-muted mt-1 text-xs leading-5">
            反馈会进入下一次选题记忆，用来避免重复差角度、强化好文章特征。
          </p>
        </div>
        {feedback && (
          <Badge
            tone={feedback.rating === "good"
              ? "success"
              : feedback.rating === "bad"
              ? "danger"
              : "muted"}
          >
            已反馈 · {feedbackLabel(feedback.rating)}
          </Badge>
        )}
      </div>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {(["good", "ok", "bad"] as EditorialFeedbackRating[]).map((item) => (
            <button
              key={item}
              type="button"
              className={cx(
                "h-8 rounded-md border px-3 text-sm transition",
                rating === item
                  ? "border-[#0f172a] bg-[#0f172a] text-white"
                  : "border-[#e2e8f0] bg-[#ffffff]/80 text-[#4d4338] hover:bg-[#f5ecdc]",
              )}
              onClick={() => setRating(item)}
            >
              {feedbackLabel(item)}
            </button>
          ))}
        </div>
        <textarea
          className="min-h-20 rounded-md border border-[#e2e8f0] bg-[#ffffff]/80 px-3 py-2 text-sm text-[#201a15] outline-none transition placeholder:text-[#a99b88] focus:border-[#b99b72]"
          value={note}
          placeholder="一句话说明：为什么好，或者哪里不够好。"
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        {error && (
          <div className="tp-danger rounded-md border p-2 text-xs">{error}</div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="size-3.5" />
            保存反馈
          </Button>
          {feedback && (
            <Button
              size="sm"
              variant="ghost"
              onClick={remove}
              disabled={saving}
            >
              删除反馈
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function feedbackLabel(rating: EditorialFeedbackRating): string {
  if (rating === "good") return "好";
  if (rating === "bad") return "差";
  return "一般";
}

function collectArtifacts(run: ArticleRunDetail | null): ArtifactRef[] {
  if (!run) return [];
  const byKey = new Map<string, ArtifactRef>();
  for (const artifact of run.artifacts ?? []) {
    byKey.set(artifact.key, artifact);
  }
  for (const step of run.steps ?? []) {
    for (const artifact of step.inputArtifacts ?? []) {
      byKey.set(artifact.key, artifact);
    }
    for (const artifact of step.outputArtifacts ?? []) {
      byKey.set(artifact.key, artifact);
    }
  }
  return [...byKey.values()];
}

function findTopicArtifact(run: ArticleRunDetail | null): ArtifactRef | null {
  return collectArtifacts(run).find((artifact) =>
    artifact.key.includes("editorial-topics") ||
    artifact.label === "今日选题"
  ) ?? null;
}

function findArticlePlanArtifact(
  run: ArticleRunDetail | null,
): ArtifactRef | null {
  return collectArtifacts(run).find((artifact) =>
    artifact.key.includes("article-plan") ||
    artifact.label === "文章计划"
  ) ?? null;
}

function findEditorialDecisionArtifact(
  run: ArticleRunDetail | null,
): ArtifactRef | null {
  return collectArtifacts(run).find((artifact) =>
    artifact.key.includes("editorial-decision") ||
    artifact.label === "编辑决策"
  ) ?? null;
}

function findQualityReviewArtifact(
  run: ArticleRunDetail | null,
): ArtifactRef | null {
  return collectArtifacts(run).find((artifact) =>
    artifact.key.includes("quality-review") ||
    artifact.label === "质量审稿"
  ) ?? null;
}

function findSourceHealthArtifact(
  run: ArticleRunDetail | null,
): ArtifactRef | null {
  return collectArtifacts(run).find((artifact) =>
    artifact.key.includes("source-health") ||
    artifact.label === "数据源健康"
  ) ?? null;
}

function findEditorialMemoryArtifact(
  run: ArticleRunDetail | null,
): ArtifactRef | null {
  return collectArtifacts(run).find((artifact) =>
    artifact.key.includes("editorial-memory") ||
    artifact.label === "编辑记忆"
  ) ?? null;
}

function findPublishArtifact(run: ArticleRunDetail | null): ArtifactRef | null {
  return collectArtifacts(run).find((artifact) =>
    artifact.key.includes("publish-result") ||
    artifact.label === "发布结果"
  ) ?? null;
}

function recommendationLabel(value: TopicRecommendation) {
  switch (value) {
    case "lead":
      return "主线";
    case "brief":
      return "短讯";
    case "watch":
      return "观察";
    case "skip":
      return "跳过";
  }
}

function recommendationTone(value: TopicRecommendation) {
  if (value === "lead") return "success";
  if (value === "skip") return "danger";
  if (value === "brief") return "info";
  return "muted";
}

function TopicsWorkspace(
  {
    run,
    apiKey,
    onPreviewArtifact,
  }: {
    run: ArticleRunDetail | null;
    apiKey: string;
    onPreviewArtifact: (artifact: ArtifactRef) => void;
  },
) {
  const artifact = useMemo(() => findTopicArtifact(run), [run]);
  const [report, setReport] = useState<EditorialTopicReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!artifact) {
      setReport(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    apiArtifact(
      `/api/artifacts?key=${encodeURIComponent(artifact.key)}`,
      apiKey,
    )
      .then(async (response) =>
        setReport(JSON.parse(await response.text()) as EditorialTopicReport)
      )
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
      .finally(() => setLoading(false));
  }, [artifact, apiKey]);

  if (!run) {
    return (
      <Card>
        <EmptyState>选择一条运行记录查看今日选题</EmptyState>
      </Card>
    );
  }

  if (!artifact) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="tp-title text-base font-semibold">今日选题</h2>
          <Badge>{run.runId}</Badge>
        </div>
        <EmptyState>
          当前 run 还没有选题产物。新版本运行后会生成主题聚类和评分。
        </EmptyState>
      </Card>
    );
  }

  const scoreByTopic = new Map(
    report?.scores.map((score) => [score.topicId, score]) ?? [],
  );
  const sortedClusters = [...(report?.clusters ?? [])].sort((left, right) =>
    (scoreByTopic.get(right.id)?.finalScore ?? 0) -
    (scoreByTopic.get(left.id)?.finalScore ?? 0)
  );
  const leadCount =
    report?.scores.filter((score) => score.recommendedUse === "lead").length ??
      0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge>{run.runId}</Badge>
              {report?.fallback && <Badge tone="danger">fallback</Badge>}
              {report && <Badge tone="success">{leadCount} 个主线候选</Badge>}
            </div>
            <h2 className="tp-title text-lg font-semibold">今日选题</h2>
            <p className="tp-muted mt-1 text-sm leading-6">
              系统先把抓取内容聚成主题，再按新鲜度、相关性、影响、证据和风险给出编辑建议。
            </p>
            {report?.error && (
              <div className="tp-danger mt-3 rounded-md border p-3 text-sm">
                AI 选题失败，已使用本地兜底：{report.error}
              </div>
            )}
          </div>
          <Button size="sm" onClick={() => onPreviewArtifact(artifact)}>
            <FileJson className="size-3.5" />
            查看 JSON
          </Button>
        </div>
      </Card>

      {loading && (
        <Card>
          <EmptyState>正在加载选题产物...</EmptyState>
        </Card>
      )}
      {error && (
        <div className="tp-danger rounded-md border p-3 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && report && (
        <div className="grid gap-3 lg:grid-cols-2">
          {sortedClusters.map((cluster) => {
            const score = scoreByTopic.get(cluster.id);
            return (
              <Card key={cluster.id} className="p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        tone={recommendationTone(
                          score?.recommendedUse ??
                            "watch",
                        )}
                      >
                        {recommendationLabel(score?.recommendedUse ?? "watch")}
                      </Badge>
                      <Badge>{score?.finalScore ?? "-"} 分</Badge>
                      <Badge>{cluster.sourceCount} sources</Badge>
                    </div>
                    <h3 className="tp-title text-base font-semibold leading-6">
                      {cluster.title}
                    </h3>
                  </div>
                </div>
                <p className="tp-muted text-sm leading-6">{cluster.summary}</p>
                {score?.reason && (
                  <div className="mt-3 rounded-md border border-[#e2e8f0] bg-[#ffffff]/58 p-2.5 text-sm leading-6 text-[#475569]">
                    {score.reason}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <MetricChip label="新鲜度" value={score?.novelty ?? "-"} />
                  <MetricChip label="相关性" value={score?.relevance ?? "-"} />
                  <MetricChip label="影响" value={score?.impact ?? "-"} />
                  <MetricChip label="证据" value={score?.evidence ?? "-"} />
                  <MetricChip
                    label="可行动"
                    value={score?.actionability ?? "-"}
                  />
                  <MetricChip label="风险" value={score?.risk ?? "-"} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {cluster.keywords.slice(0, 6).map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-xs text-[#64748b]"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
                <div className="tp-muted mt-3 truncate text-xs">
                  Primary: {cluster.primaryArticleId} · Articles:{" "}
                  {cluster.articleIds.join(", ")}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditorialDecisionWorkspace(
  {
    run,
    apiKey,
    onPreviewArtifact,
  }: {
    run: ArticleRunDetail | null;
    apiKey: string;
    onPreviewArtifact: (artifact: ArtifactRef) => void;
  },
) {
  const artifact = useMemo(() => findEditorialDecisionArtifact(run), [run]);
  const [decision, setDecision] = useState<EditorialDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!artifact) {
      setDecision(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    apiArtifact(
      `/api/artifacts?key=${encodeURIComponent(artifact.key)}`,
      apiKey,
    )
      .then(async (response) =>
        setDecision(JSON.parse(await response.text()) as EditorialDecision)
      )
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
      .finally(() => setLoading(false));
  }, [artifact, apiKey]);

  if (!run) {
    return (
      <Card>
        <EmptyState>选择一条运行记录查看编辑决策</EmptyState>
      </Card>
    );
  }

  if (!artifact) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="tp-title text-base font-semibold">编辑决策</h2>
          <Badge>{run.runId}</Badge>
        </div>
        <EmptyState>
          当前 run 还没有编辑决策产物。新版本运行后会解释为什么写这篇。
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge>{run.runId}</Badge>
              {decision?.fallback && <Badge tone="danger">fallback</Badge>}
              {decision && (
                <Badge tone="success">{decision.recommendedFormat}</Badge>
              )}
              {decision && (
                <Badge
                  tone={decision.duplicationRisk.level === "high"
                    ? "danger"
                    : decision.duplicationRisk.level === "medium"
                    ? "muted"
                    : "success"}
                >
                  重复风险 {decision.duplicationRisk.level}
                </Badge>
              )}
            </div>
            <h2 className="tp-title text-lg font-semibold">为什么写这篇</h2>
            <p className="tp-muted mt-1 text-sm leading-6">
              编辑决策会把主题评分、历史记忆和人工反馈转成写作前的取舍说明。
            </p>
            {decision?.error && (
              <div className="tp-danger mt-3 rounded-md border p-3 text-sm">
                AI 编辑决策失败，已使用本地兜底：{decision.error}
              </div>
            )}
          </div>
          <Button size="sm" onClick={() => onPreviewArtifact(artifact)}>
            <FileJson className="size-3.5" />
            查看 JSON
          </Button>
        </div>
      </Card>

      {loading && (
        <Card>
          <EmptyState>正在加载编辑决策...</EmptyState>
        </Card>
      )}
      {error && (
        <div className="tp-danger rounded-md border p-3 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && decision && (
        <>
          <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
            <Card>
              <div className="tp-muted text-xs">主线选题</div>
              <h3 className="tp-title mt-2 text-xl font-semibold leading-7">
                {decision.leadTopicTitle}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#334155]">
                {decision.decisionSummary}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {decision.whyThisNow.map((reason) => (
                  <div
                    key={reason}
                    className="rounded-md border border-[#e2e8f0] bg-[#ffffff]/58 p-2.5 text-sm leading-6 text-[#475569]"
                  >
                    {reason}
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="tp-title mb-3 text-base font-semibold">
                写作边界
              </h3>
              <div className="space-y-2">
                {decision.writingDirectives.map((item) => (
                  <p key={item} className="text-sm leading-6 text-[#334155]">
                    {item}
                  </p>
                ))}
              </div>
              {decision.titleWarnings.length > 0 && (
                <div className="mt-4 rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-3">
                  <div className="tp-title mb-2 text-sm font-semibold">
                    标题避免项
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {decision.titleWarnings.map((item) => (
                      <Badge key={item} tone="danger">{item}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <h3 className="tp-title mb-3 text-base font-semibold">
                入选主题
              </h3>
              <div className="space-y-2">
                {decision.selectedTopics.map((topic) => (
                  <div
                    key={topic.topicId}
                    className="rounded-md border border-[#e2e8f0] p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Badge tone={topic.role === "lead" ? "success" : "info"}>
                        {topic.role}
                      </Badge>
                      <span className="tp-title text-sm font-medium">
                        {topic.topicId}
                      </span>
                    </div>
                    <p className="tp-muted text-sm leading-6">{topic.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="tp-title mb-3 text-base font-semibold">
                跳过主题
              </h3>
              {decision.skippedTopics.length
                ? (
                  <div className="space-y-2">
                    {decision.skippedTopics.map((topic) => (
                      <div
                        key={topic.topicId}
                        className="rounded-md border border-[#e2e8f0] p-3"
                      >
                        <div className="tp-title text-sm font-medium">
                          {topic.topicId}
                        </div>
                        <p className="tp-muted mt-1 text-sm leading-6">
                          {topic.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                )
                : <EmptyState>没有明确跳过的主题</EmptyState>}
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="tp-title text-base font-semibold">来源判断</h3>
              <Badge>{decision.sourceJudgements.length} sources</Badge>
            </div>
            {decision.sourceJudgements.length
              ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {decision.sourceJudgements.map((source) => (
                    <div
                      key={source.url}
                      className="rounded-md border border-[#e2e8f0] bg-[#ffffff]/58 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="tp-title min-w-0 truncate text-sm font-medium">
                          {hostLabel(source.url)}
                        </span>
                        <Badge>{source.role}</Badge>
                      </div>
                      <p className="tp-muted text-sm leading-6">
                        {source.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )
              : <EmptyState>没有单独来源判断</EmptyState>}
          </Card>
        </>
      )}
    </div>
  );
}

function ArticlePlanWorkspace(
  {
    run,
    apiKey,
    onPreviewArtifact,
  }: {
    run: ArticleRunDetail | null;
    apiKey: string;
    onPreviewArtifact: (artifact: ArtifactRef) => void;
  },
) {
  const artifact = useMemo(() => findArticlePlanArtifact(run), [run]);
  const [plan, setPlan] = useState<ArticlePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!artifact) {
      setPlan(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    apiArtifact(
      `/api/artifacts?key=${encodeURIComponent(artifact.key)}`,
      apiKey,
    )
      .then(async (response) =>
        setPlan(JSON.parse(await response.text()) as ArticlePlan)
      )
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
      .finally(() => setLoading(false));
  }, [artifact, apiKey]);

  if (!run) {
    return (
      <Card>
        <EmptyState>选择一条运行记录查看文章计划</EmptyState>
      </Card>
    );
  }

  if (!artifact) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="tp-title text-base font-semibold">文章计划</h2>
          <Badge>{run.runId}</Badge>
        </div>
        <EmptyState>
          当前 run 还没有文章计划产物。新版本运行后会在正文生成前输出计划。
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge>{run.runId}</Badge>
              {plan?.fallback && <Badge tone="danger">fallback</Badge>}
              {plan && <Badge tone="success">{plan.format}</Badge>}
            </div>
            <h2 className="tp-title text-lg font-semibold">文章计划</h2>
            <p className="tp-muted mt-1 text-sm leading-6">
              正文生成前的编辑蓝图：主线、章节、标题、封面、配图和风险边界。
            </p>
            {plan?.error && (
              <div className="tp-danger mt-3 rounded-md border p-3 text-sm">
                AI 文章计划失败，已使用本地兜底：{plan.error}
              </div>
            )}
          </div>
          <Button size="sm" onClick={() => onPreviewArtifact(artifact)}>
            <FileJson className="size-3.5" />
            查看 JSON
          </Button>
        </div>
      </Card>

      {loading && (
        <Card>
          <EmptyState>正在加载文章计划...</EmptyState>
        </Card>
      )}
      {error && (
        <div className="tp-danger rounded-md border p-3 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && plan && (
        <>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <div className="tp-muted mb-2 text-xs">主线观点</div>
              <h3 className="tp-title text-lg font-semibold leading-7">
                {plan.thesis}
              </h3>
              <p className="tp-muted mt-3 text-sm leading-6">
                {plan.summary}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <MetricChip label="目标读者" value={plan.targetReader} />
                <MetricChip
                  label="来源文章"
                  value={plan.sourceArticleIds.length}
                />
              </div>
            </Card>
            <Card>
              <div className="tp-muted mb-2 text-xs">封面方向</div>
              <h3 className="tp-title text-base font-semibold">
                {plan.coverDirection.textBrief}
              </h3>
              <p className="tp-muted mt-2 text-sm leading-6">
                {plan.coverDirection.visualBrief}
              </p>
              <Badge className="mt-3">{plan.coverDirection.mood}</Badge>
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="tp-title text-base font-semibold">章节结构</h3>
              <Badge>{plan.sections.length} sections</Badge>
            </div>
            <div className="space-y-3">
              {plan.sections.map((section, index) => (
                <div
                  key={section.id}
                  className="rounded-md border border-[#e2e8f0] bg-[#ffffff]/58 p-3"
                >
                  <div className="mb-2 flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#0f172a] text-xs font-semibold text-[#ffffff]">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h4 className="tp-title text-sm font-semibold leading-6">
                        {section.title}
                      </h4>
                      <p className="tp-muted text-xs leading-5">
                        {section.intent} · {section.angle}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2 lg:grid-cols-[1fr_160px]">
                    <div className="space-y-1">
                      {section.keyPoints.slice(0, 5).map((point) => (
                        <p
                          key={point}
                          className="text-sm leading-6 text-[#334155]"
                        >
                          {point}
                        </p>
                      ))}
                    </div>
                    <div className="tp-muted text-xs leading-5">
                      Articles: {section.articleIds.join(", ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <h3 className="tp-title mb-3 text-base font-semibold">
                标题方向
              </h3>
              <div className="space-y-2">
                {plan.titleDirections.map((item) => (
                  <div
                    key={`${item.title}-${item.angle}`}
                    className="rounded-md border border-[#e2e8f0] p-3"
                  >
                    <div className="tp-title text-sm font-semibold">
                      {item.title}
                    </div>
                    <p className="tp-muted mt-1 text-xs leading-5">
                      {item.angle} · {item.reason}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="tp-title mb-3 text-base font-semibold">
                风险边界
              </h3>
              <div className="space-y-2">
                {plan.riskNotes.map((note) => (
                  <div
                    key={`${note.level}-${note.issue}`}
                    className="rounded-md border border-[#e2e8f0] p-3"
                  >
                    <Badge
                      tone={note.level === "high"
                        ? "danger"
                        : note.level === "medium"
                        ? "info"
                        : "muted"}
                    >
                      {note.level}
                    </Badge>
                    <div className="tp-title mt-2 text-sm font-semibold">
                      {note.issue}
                    </div>
                    <p className="tp-muted mt-1 text-xs leading-5">
                      {note.handling}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function QualityReviewWorkspace(
  {
    run,
    apiKey,
    onPreviewArtifact,
  }: {
    run: ArticleRunDetail | null;
    apiKey: string;
    onPreviewArtifact: (artifact: ArtifactRef) => void;
  },
) {
  const artifact = useMemo(() => findQualityReviewArtifact(run), [run]);
  const publishArtifact = useMemo(() => findPublishArtifact(run), [run]);
  const [review, setReview] = useState<ArticleQualityReview | null>(null);
  const [publishResult, setPublishResult] = useState<
    PublishArtifactResult | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!artifact) {
      setReview(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    apiArtifact(
      `/api/artifacts?key=${encodeURIComponent(artifact.key)}`,
      apiKey,
    )
      .then(async (response) =>
        setReview(JSON.parse(await response.text()) as ArticleQualityReview)
      )
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
      .finally(() => setLoading(false));
  }, [artifact, apiKey]);

  useEffect(() => {
    if (!publishArtifact) {
      setPublishResult(null);
      return;
    }
    apiArtifact(
      `/api/artifacts?key=${encodeURIComponent(publishArtifact.key)}`,
      apiKey,
    )
      .then(async (response) =>
        setPublishResult(
          JSON.parse(await response.text()) as PublishArtifactResult,
        )
      )
      .catch(() => setPublishResult(null));
  }, [publishArtifact, apiKey]);

  if (!run) {
    return (
      <Card>
        <EmptyState>选择一条运行记录查看质量审稿</EmptyState>
      </Card>
    );
  }

  if (!artifact) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="tp-title text-base font-semibold">质量审稿</h2>
          <Badge>{run.runId}</Badge>
        </div>
        <EmptyState>
          当前 run 还没有质量审稿产物。新版本运行后会在发布前输出审稿报告。
        </EmptyState>
      </Card>
    );
  }

  const dimensionLabels: Record<string, string> = {
    factConsistency: "事实一致",
    titleQuality: "标题质量",
    structureQuality: "结构",
    expressionQuality: "表达",
    htmlCompliance: "HTML",
    imageRelevance: "图片",
    riskHandling: "风险",
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge>{run.runId}</Badge>
              {review?.fallback && <Badge tone="danger">fallback</Badge>}
              {review && (
                <Badge tone={review.allowPublish ? "success" : "danger"}>
                  {review.recommendedAction}
                </Badge>
              )}
            </div>
            <h2 className="tp-title text-lg font-semibold">质量审稿</h2>
            <p className="tp-muted mt-1 text-sm leading-6">
              发布前检查事实、标题、结构、表达、HTML、图片和风险边界。
            </p>
            {review?.error && (
              <div className="tp-danger mt-3 rounded-md border p-3 text-sm">
                AI 审稿失败，已使用本地兜底：{review.error}
              </div>
            )}
            {publishResult?.status === "blocked" && (
              <div className="tp-danger mt-3 rounded-md border p-3 text-sm">
                真实发布已被质量门禁拦截：{publishResult.reason ?? "质量未通过"}
              </div>
            )}
          </div>
          <Button size="sm" onClick={() => onPreviewArtifact(artifact)}>
            <FileJson className="size-3.5" />
            查看 JSON
          </Button>
        </div>
      </Card>

      {loading && (
        <Card>
          <EmptyState>正在加载质量审稿...</EmptyState>
        </Card>
      )}
      {error && (
        <div className="tp-danger rounded-md border p-3 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && review && (
        <>
          <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
            <Card>
              <div className="tp-muted text-xs">总分</div>
              <div className="mt-2 flex items-end gap-2">
                <span className="tp-title text-5xl font-semibold leading-none">
                  {review.overallScore}
                </span>
                <span className="tp-muted pb-1 text-sm">/ 100</span>
              </div>
              <p className="tp-muted mt-4 text-sm leading-6">
                {review.summary}
              </p>
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="tp-title text-base font-semibold">维度评分</h3>
                <Badge>{Object.keys(review.dimensionScores).length}</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(review.dimensionScores).map(([key, value]) => (
                  <MetricChip
                    key={key}
                    label={dimensionLabels[key] ?? key}
                    value={value}
                  />
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="tp-title text-base font-semibold">问题列表</h3>
              <Badge>{review.issues.length} issues</Badge>
            </div>
            {review.issues.length
              ? (
                <div className="space-y-2">
                  {review.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-md border border-[#e2e8f0] bg-[#ffffff]/58 p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge tone={issueSeverityTone(issue.severity)}>
                          {issue.severity}
                        </Badge>
                        <Badge>{issue.category}</Badge>
                        {issue.autoFixable && <Badge tone="info">可修复</Badge>}
                      </div>
                      <div className="tp-title text-sm font-semibold">
                        {issue.message}
                      </div>
                      {issue.evidence && (
                        <p className="tp-muted mt-1 text-xs leading-5">
                          证据：{issue.evidence}
                        </p>
                      )}
                      <p className="mt-2 text-sm leading-6 text-[#334155]">
                        {issue.suggestion}
                      </p>
                    </div>
                  ))}
                </div>
              )
              : <EmptyState>没有发现明确问题</EmptyState>}
          </Card>

          {review.repairSuggestions.length > 0 && (
            <Card>
              <h3 className="tp-title mb-3 text-base font-semibold">
                修复建议
              </h3>
              <div className="space-y-2">
                {review.repairSuggestions.map((suggestion) => (
                  <p
                    key={suggestion}
                    className="rounded-md border border-[#e2e8f0] p-3 text-sm leading-6 text-[#334155]"
                  >
                    {suggestion}
                  </p>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ArticleQualityWorkspace(
  {
    run,
    apiKey,
    onPreviewArtifact,
  }: {
    run: ArticleRunDetail | null;
    apiKey: string;
    onPreviewArtifact: (artifact: ArtifactRef) => void;
  },
) {
  return (
    <ArticleQualityShell
      runStatus={run?.status}
      renderTab={(tab) => (
        tab === "review"
          ? (
            <QualityReviewWorkspace
              run={run}
              apiKey={apiKey}
              onPreviewArtifact={onPreviewArtifact}
            />
          )
          : tab === "topics"
          ? (
            <TopicsWorkspace
              run={run}
              apiKey={apiKey}
              onPreviewArtifact={onPreviewArtifact}
            />
          )
          : tab === "decision"
          ? (
            <EditorialDecisionWorkspace
              run={run}
              apiKey={apiKey}
              onPreviewArtifact={onPreviewArtifact}
            />
          )
          : (
            <ArticlePlanWorkspace
              run={run}
              apiKey={apiKey}
              onPreviewArtifact={onPreviewArtifact}
            />
          )
      )}
    />
  );
}

function issueSeverityTone(
  severity: ArticleQualityReview["issues"][number]["severity"],
) {
  if (severity === "blocker" || severity === "high") return "danger";
  if (severity === "medium") return "info";
  return "muted";
}

function RunsWorkspace(
  {
    runs,
    selectedRunId,
    selectedRun,
    filter,
    setFilter,
    query,
    setQuery,
    onSelectRun,
    apiKey,
    profileId,
    onPreviewArtifact,
  }: {
    runs: ArticleRunRecord[];
    selectedRunId: string | null;
    selectedRun: ArticleRunDetail | null;
    filter: "all" | RunStatus;
    setFilter: (filter: "all" | RunStatus) => void;
    query: string;
    setQuery: (query: string) => void;
    onSelectRun: (runId: string) => void;
    apiKey: string;
    profileId: string;
    onPreviewArtifact: (artifact: ArtifactRef) => void;
  },
) {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <RunList
        runs={runs}
        selectedRunId={selectedRunId}
        onSelect={onSelectRun}
        filter={filter}
        setFilter={setFilter}
        query={query}
        setQuery={setQuery}
      />
      <RunDetail
        run={selectedRun}
        apiKey={apiKey}
        profileId={profileId}
        onPreviewArtifact={onPreviewArtifact}
      />
    </div>
  );
}

function ArtifactsPanel(
  {
    run,
    onPreviewArtifact,
  }: {
    run: ArticleRunDetail | null;
    onPreviewArtifact: (artifact: ArtifactRef) => void;
  },
) {
  const artifacts = useMemo(() => collectArtifacts(run), [run]);

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="tp-title text-base font-semibold">产物预览</h2>
          <p className="tp-muted mt-1 text-sm">
            当前选中 run 的 HTML、JSON、图片和运行快照。
          </p>
        </div>
        <Badge>{artifacts.length} artifacts</Badge>
      </div>

      {artifacts.length
        ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {artifacts.map((artifact) => (
              <button
                key={artifact.key}
                type="button"
                onClick={() => onPreviewArtifact(artifact)}
                className="tp-section flex min-h-28 flex-col justify-between rounded-lg border p-3 text-left transition hover:bg-[#f8fafc]"
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-md bg-[#eff6ff] text-[#2563eb]">
                    {artifactIcon(artifact.contentType)}
                  </div>
                  <div className="min-w-0">
                    <div className="tp-title truncate text-sm font-semibold">
                      {artifact.label ?? artifact.key.split("/").pop()}
                    </div>
                    <div className="tp-muted mt-1 line-clamp-2 text-xs">
                      {artifact.key}
                    </div>
                  </div>
                </div>
                <div className="tp-muted mt-4 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">{artifact.contentType}</span>
                  <span>{formatSize(artifact.size)}</span>
                </div>
              </button>
            ))}
          </div>
        )
        : <EmptyState>当前运行还没有可预览产物</EmptyState>}
    </Card>
  );
}

function ArtifactPreview(
  {
    artifact,
    apiKey,
    onClose,
  }: {
    artifact: ArtifactRef | null;
    apiKey: string;
    onClose: () => void;
  },
) {
  const [content, setContent] = useState<string>("");
  const [objectUrl, setObjectUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!artifact) return;
    let nextObjectUrl = "";
    setLoading(true);
    setError("");
    setContent("");
    setObjectUrl("");
    apiArtifact(
      `/api/artifacts?key=${encodeURIComponent(artifact.key)}`,
      apiKey,
    )
      .then(async (response) => {
        const blob = await response.blob();
        if (artifact.contentType.includes("image/")) {
          nextObjectUrl = URL.createObjectURL(blob);
          setObjectUrl(nextObjectUrl);
          return;
        }
        setContent(await blob.text());
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
      .finally(() => setLoading(false));
    return () => {
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [artifact, apiKey]);

  if (!artifact) return null;

  const isHtml = artifact.contentType.includes("html");
  const isJson = artifact.contentType.includes("json");
  const isImage = artifact.contentType.includes("image/");

  return (
    <div className="tp-overlay fixed inset-0 z-50 p-4 backdrop-blur-sm">
      <div className="tp-panel mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg border shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] p-4">
          <div className="min-w-0">
            <h3 className="tp-title truncate text-base font-semibold">
              {artifact.label ?? artifact.key}
            </h3>
            <p className="tp-muted truncate text-xs">
              {artifact.contentType} · {artifact.key}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>关闭</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[#f8fafc] p-4">
          {loading && <EmptyState>正在加载产物...</EmptyState>}
          {error && (
            <div className="tp-danger rounded-md border p-3 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && isImage && objectUrl && (
            <img
              className="mx-auto max-h-full max-w-full rounded-md border border-[#e2e8f0] bg-[#ffffff] object-contain"
              src={objectUrl}
              alt={artifact.label ?? artifact.key}
            />
          )}
          {!loading && !error && isHtml && content && (
            <iframe
              className="h-full min-h-[70vh] w-full rounded-md border border-[#e2e8f0] bg-white"
              srcDoc={content}
              title={artifact.label ?? artifact.key}
              sandbox=""
            />
          )}
          {!loading && !error && !isImage && !isHtml && (
            <pre className="tp-code min-h-[70vh] overflow-auto rounded-md border p-4 text-xs leading-5">
              {isJson ? prettyJson(content) : content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function prettyJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readPath(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return current;
}

function readString(value: unknown, path: string[], fallback = "-") {
  const result = readPath(value, path);
  return typeof result === "string" && result.trim() ? result : fallback;
}

function readNumber(value: unknown, path: string[], fallback = 0) {
  const result = readPath(value, path);
  return typeof result === "number" && Number.isFinite(result)
    ? result
    : fallback;
}

function readBoolean(value: unknown, path: string[], fallback = false) {
  const result = readPath(value, path);
  return typeof result === "boolean" ? result : fallback;
}

function hostLabel(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function compactConfig(config: Record<string, unknown>) {
  const labelForKey = (key: string) => {
    if (key === "model") return "模型";
    if (key === "size") return "尺寸";
    if (key === "count") return "数量";
    if (key === "channels") return "渠道";
    if (key === "temperature") return "温度";
    return key;
  };
  const entries = Object.entries(config)
    .filter(([, value]) =>
      typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean"
    )
    .slice(0, 3);
  if (!entries.length) return "未配置额外参数";
  return entries.map(([key, value]) => `${labelForKey(key)}: ${String(value)}`)
    .join(" · ");
}

function capabilityKindLabel(kind: string) {
  if (kind === "llm") return "大模型";
  if (kind === "image-generation") return "图片生成";
  if (kind === "notification") return "通知";
  if (kind === "fetch-strategy") return "抓取策略";
  if (kind === "embedding") return "向量去重";
  return kind;
}

function capabilityKindDescription(kind: string) {
  if (kind === "llm") return "用于排序、摘要、标题、动态模板和审稿。";
  if (kind === "image-generation") return "用于封面图和正文配图。";
  if (kind === "notification") return "运行成功、失败和关键风险通知。";
  if (kind === "fetch-strategy") return "定义抓取 provider 的 fallback 顺序。";
  if (kind === "embedding") return "用于文章去重和相似度判断。";
  return "共享能力配置。";
}

function capabilityOptions(
  capabilities: CapabilityProfile[],
  kind: string,
) {
  return capabilities.filter((item) => item.kind === kind && item.enabled);
}

function firstCapabilityId(
  capabilities: CapabilityProfile[],
  kind: string,
) {
  return capabilityOptions(capabilities, kind)[0]?.id ?? "";
}

function providerForCapabilityKind(kind: string) {
  if (kind === "llm") return "openai-compatible";
  if (kind === "image-generation") return "dashscope";
  if (kind === "notification") return "multi-channel";
  if (kind === "fetch-strategy") return "configured-fetch-groups";
  if (kind === "embedding") return "dashscope";
  return "";
}

function capabilityDraftFromProfile(
  profile?: CapabilityProfile,
): CapabilityFormDraft {
  const kind = profile?.kind ?? "llm";
  const config = asRecord(profile?.config);
  const channelsValue = config.channels;
  return {
    id: profile?.id ?? `cap-${crypto.randomUUID()}`,
    kind,
    name: profile?.name ?? "",
    enabled: profile?.enabled ?? true,
    provider: profile?.provider ?? providerForCapabilityKind(kind),
    model: readString(config, ["model"], ""),
    count: readNumber(config, ["count"], 1).toString(),
    size: readString(config, ["size"], "1024*1024"),
    channels: Array.isArray(channelsValue)
      ? channelsValue.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function capabilityConfigFromDraft(draft: CapabilityFormDraft) {
  if (draft.kind === "image-generation") {
    const config: Record<string, unknown> = {};
    if (draft.model.trim()) config.model = draft.model.trim();
    const count = Number(draft.count);
    if (Number.isFinite(count)) config.count = count;
    if (draft.size.trim()) config.size = draft.size.trim();
    return config;
  }
  if (draft.kind === "notification") {
    return { channels: draft.channels };
  }
  if (draft.kind === "llm" || draft.kind === "embedding") {
    return draft.model.trim() ? { model: draft.model.trim() } : {};
  }
  return {};
}

function articleDraftFromConfig(
  article: Record<string, unknown>,
  capabilities: CapabilityProfile[],
): ArticleFormDraft {
  const coverOverrides = asRecord(readPath(article, ["cover", "overrides"]));
  const bodyOverrides = asRecord(
    readPath(article, ["bodyImages", "overrides"]),
  );
  const qualityGate = asRecord(readPath(article, ["qualityGate"]));
  return {
    count: readNumber(article, ["count"], 10).toString(),
    dryRun: readBoolean(article, ["dryRun"], true),
    template: readString(article, ["renderer", "template"], "minimal"),
    promptProfile: readString(
      article,
      ["renderer", "promptProfile"],
      "technology",
    ),
    llmProfileId: readString(article, ["renderer", "llmProfileId"], "") ||
      firstCapabilityId(capabilities, "llm"),
    publisherProvider: readString(
      article,
      ["publisher", "provider"],
      "weixin-relay",
    ),
    coverEnabled: readBoolean(article, ["cover", "enabled"], false),
    coverImageProfileId: readString(article, ["cover", "imageProfileId"], "") ||
      firstCapabilityId(capabilities, "image-generation"),
    coverModel: readString(coverOverrides, ["model"], ""),
    bodyImagesMode: readString(article, ["bodyImages", "mode"], "off"),
    bodyImageProfileId:
      readString(article, ["bodyImages", "imageProfileId"], "") ||
      firstCapabilityId(capabilities, "image-generation"),
    bodyImageCount: readNumber(bodyOverrides, ["count"], 1).toString(),
    bodyImageSize: readString(bodyOverrides, ["size"], "1024*1024"),
    dedupEnabled: readBoolean(article, ["deduplication", "enabled"], false),
    embeddingProfileId:
      readString(article, ["deduplication", "embeddingProfileId"], "") ||
      firstCapabilityId(capabilities, "embedding"),
    vectorStore: readString(
      article,
      ["deduplication", "vectorStore"],
      "sqlite",
    ),
    notificationProfileId: readString(
      article,
      ["notifications", "profileId"],
      "",
    ),
    qualityGateEnabled: readBoolean(qualityGate, ["enabled"], true),
    qualityGateMinScore: readNumber(qualityGate, ["minScore"], 80).toString(),
    qualityGateBlockOnHighFactIssue: readBoolean(
      qualityGate,
      ["blockOnHighFactIssue"],
      true,
    ),
    qualityGateAllowForcePublish: readBoolean(
      qualityGate,
      ["allowForcePublish"],
      true,
    ),
    qualityGateMaxRevisionRounds: readNumber(
      qualityGate,
      ["maxRevisionRounds"],
      1,
    ).toString(),
  };
}

function articlePatchFromDraft(draft: ArticleFormDraft) {
  const count = Number(draft.count);
  const bodyImageCount = Number(draft.bodyImageCount);
  const minScore = Number(draft.qualityGateMinScore);
  const maxRevisionRounds = Number(draft.qualityGateMaxRevisionRounds);
  return {
    count: Number.isFinite(count) ? count : 10,
    dryRun: draft.dryRun,
    renderer: {
      template: draft.template,
      promptProfile: draft.promptProfile,
      llmProfileId: draft.llmProfileId,
    },
    publisher: {
      provider: draft.publisherProvider,
    },
    cover: {
      enabled: draft.coverEnabled,
      imageProfileId: draft.coverImageProfileId,
      overrides: draft.coverModel.trim()
        ? { model: draft.coverModel.trim() }
        : {},
    },
    bodyImages: {
      mode: draft.bodyImagesMode,
      imageProfileId: draft.bodyImageProfileId,
      overrides: {
        count: Number.isFinite(bodyImageCount) ? bodyImageCount : 1,
        size: draft.bodyImageSize.trim() || "1024*1024",
      },
    },
    deduplication: {
      enabled: draft.dedupEnabled,
      embeddingProfileId: draft.embeddingProfileId,
      vectorStore: draft.vectorStore,
    },
    notifications: {
      profileId: draft.notificationProfileId || undefined,
    },
    qualityGate: {
      enabled: draft.qualityGateEnabled,
      minScore: Number.isFinite(minScore) ? minScore : 80,
      blockOnHighFactIssue: draft.qualityGateBlockOnHighFactIssue,
      allowForcePublish: draft.qualityGateAllowForcePublish,
      maxRevisionRounds: Number.isFinite(maxRevisionRounds)
        ? maxRevisionRounds
        : 1,
    },
  };
}

function TrendProfileView(
  { article, capabilities, saving, onSave }: {
    article: Record<string, unknown>;
    capabilities: CapabilityProfile[];
    saving: string;
    onSave: (patch: Record<string, unknown>) => Promise<void>;
  },
) {
  const [draft, setDraft] = useState<ArticleFormDraft>(() =>
    articleDraftFromConfig(article, capabilities)
  );

  useEffect(() => {
    setDraft(articleDraftFromConfig(article, capabilities));
  }, [article, capabilities]);

  const update = <K extends keyof ArticleFormDraft>(
    key: K,
    value: ArticleFormDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSave(articlePatchFromDraft(draft));
      }}
    >
      <section className="tp-section rounded-md border p-4">
        <SectionTitle
          title="文章工作流"
          description="新手只需要改这里：数量、模板、提示词、发布方式。"
          action={
            <Button size="sm" type="submit" disabled={saving === "article"}>
              <Save className="size-3.5" />
              保存
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="tp-muted text-xs font-medium">每次文章数</span>
            <Input
              type="number"
              min="1"
              max="50"
              value={draft.count}
              onChange={(event) => update("count", event.currentTarget.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="tp-muted text-xs font-medium">发布方式</span>
            <Select
              value={draft.publisherProvider}
              onChange={(event) =>
                update("publisherProvider", event.currentTarget.value)}
            >
              <option value="weixin-relay">微信 Relay</option>
              <option value="weixin">直连微信</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="tp-muted text-xs font-medium">正文模板</span>
            <Select
              value={draft.template}
              onChange={(event) =>
                update("template", event.currentTarget.value)}
            >
              {TEMPLATE_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="tp-muted text-xs font-medium">内容方向</span>
            <Select
              value={draft.promptProfile}
              onChange={(event) =>
                update("promptProfile", event.currentTarget.value)}
            >
              {PROMPT_PROFILE_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="tp-muted text-xs font-medium">
              使用的大模型能力
            </span>
            <Select
              value={draft.llmProfileId}
              onChange={(event) =>
                update("llmProfileId", event.currentTarget.value)}
            >
              {capabilityOptions(capabilities, "llm").map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.provider}
                </option>
              ))}
            </Select>
          </label>
          <label className="tp-card-soft flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2">
            <span>
              <span className="tp-title block text-sm font-medium">
                默认 dry-run
              </span>
              <span className="tp-muted block text-xs">
                开启后默认只生成产物，不创建微信草稿。
              </span>
            </span>
            <input
              className="size-4 accent-[#0f172a]"
              type="checkbox"
              checked={draft.dryRun}
              onChange={(event) =>
                update("dryRun", event.currentTarget.checked)}
            />
          </label>
        </div>
      </section>

      <section className="tp-section rounded-md border p-4">
        <SectionTitle
          title="增强能力"
          description="封面、正文配图、去重、通知都可以按需开启。"
        />
        <div className="space-y-3">
          <label className="tp-card-soft flex items-center justify-between gap-3 rounded-md border p-3">
            <span>
              <span className="tp-title block text-sm font-medium">封面图</span>
              <span className="tp-muted block text-xs">
                用图片生成能力生成公众号封面。
              </span>
            </span>
            <input
              className="size-4 accent-[#0f172a]"
              type="checkbox"
              checked={draft.coverEnabled}
              onChange={(event) =>
                update("coverEnabled", event.currentTarget.checked)}
            />
          </label>
          {draft.coverEnabled && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={draft.coverImageProfileId}
                onChange={(event) =>
                  update("coverImageProfileId", event.currentTarget.value)}
              >
                {capabilityOptions(capabilities, "image-generation").map((
                  item,
                ) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="覆盖模型，可留空"
                value={draft.coverModel}
                onChange={(event) =>
                  update("coverModel", event.currentTarget.value)}
              />
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="tp-muted text-xs font-medium">正文配图</span>
              <Select
                value={draft.bodyImagesMode}
                onChange={(event) =>
                  update("bodyImagesMode", event.currentTarget.value)}
              >
                {BODY_IMAGE_MODE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5">
              <span className="tp-muted text-xs font-medium">图片能力</span>
              <Select
                value={draft.bodyImageProfileId}
                onChange={(event) =>
                  update("bodyImageProfileId", event.currentTarget.value)}
                disabled={draft.bodyImagesMode === "off"}
              >
                {capabilityOptions(capabilities, "image-generation").map((
                  item,
                ) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5">
              <span className="tp-muted text-xs font-medium">配图数量</span>
              <Input
                type="number"
                min="1"
                max="4"
                value={draft.bodyImageCount}
                disabled={draft.bodyImagesMode === "off"}
                onChange={(event) =>
                  update("bodyImageCount", event.currentTarget.value)}
              />
            </label>
            <label className="space-y-1.5">
              <span className="tp-muted text-xs font-medium">图片尺寸</span>
              <Input
                value={draft.bodyImageSize}
                disabled={draft.bodyImagesMode === "off"}
                onChange={(event) =>
                  update("bodyImageSize", event.currentTarget.value)}
              />
            </label>
          </div>

          <label className="tp-card-soft flex items-center justify-between gap-3 rounded-md border p-3">
            <span>
              <span className="tp-title block text-sm font-medium">
                文章去重
              </span>
              <span className="tp-muted block text-xs">
                避免重复发布相似内容。
              </span>
            </span>
            <input
              className="size-4 accent-[#0f172a]"
              type="checkbox"
              checked={draft.dedupEnabled}
              onChange={(event) =>
                update("dedupEnabled", event.currentTarget.checked)}
            />
          </label>
          {draft.dedupEnabled && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={draft.embeddingProfileId}
                onChange={(event) =>
                  update("embeddingProfileId", event.currentTarget.value)}
              >
                {capabilityOptions(capabilities, "embedding").map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select
                value={draft.vectorStore}
                onChange={(event) =>
                  update("vectorStore", event.currentTarget.value)}
              >
                <option value="sqlite">SQLite</option>
                <option value="d1">D1</option>
              </Select>
            </div>
          )}

          <label className="space-y-1.5">
            <span className="tp-muted text-xs font-medium">通知能力</span>
            <Select
              value={draft.notificationProfileId}
              onChange={(event) =>
                update("notificationProfileId", event.currentTarget.value)}
            >
              <option value="">不通知</option>
              {capabilityOptions(capabilities, "notification").map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>

          <div className="rounded-md border border-[#cbd5e1] bg-[#ffffff]/70 p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <span>
                <span className="tp-title block text-sm font-medium">
                  真实发布质量门禁
                </span>
                <span className="tp-muted block text-xs leading-5">
                  dry-run 继续产出，创建微信草稿前才会按审稿结果拦截。
                </span>
              </span>
              <input
                className="size-4 accent-[#0f172a]"
                type="checkbox"
                checked={draft.qualityGateEnabled}
                onChange={(event) =>
                  update("qualityGateEnabled", event.currentTarget.checked)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="tp-muted text-xs font-medium">最低分</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.qualityGateMinScore}
                  disabled={!draft.qualityGateEnabled}
                  onChange={(event) =>
                    update("qualityGateMinScore", event.currentTarget.value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="tp-muted text-xs font-medium">修复轮次</span>
                <Input
                  type="number"
                  min="0"
                  max="2"
                  value={draft.qualityGateMaxRevisionRounds}
                  onChange={(event) =>
                    update(
                      "qualityGateMaxRevisionRounds",
                      event.currentTarget.value,
                    )}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-2">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="tp-muted">高危事实问题阻断发布</span>
                <input
                  className="size-4 accent-[#0f172a]"
                  type="checkbox"
                  checked={draft.qualityGateBlockOnHighFactIssue}
                  disabled={!draft.qualityGateEnabled}
                  onChange={(event) =>
                    update(
                      "qualityGateBlockOnHighFactIssue",
                      event.currentTarget.checked,
                    )}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="tp-muted">允许真实发布时手动强制绕过</span>
                <input
                  className="size-4 accent-[#0f172a]"
                  type="checkbox"
                  checked={draft.qualityGateAllowForcePublish}
                  disabled={!draft.qualityGateEnabled}
                  onChange={(event) =>
                    update(
                      "qualityGateAllowForcePublish",
                      event.currentTarget.checked,
                    )}
                />
              </label>
            </div>
          </div>
        </div>
      </section>
    </form>
  );
}

function SourceHealthPanel(
  { run, apiKey }: {
    run: ArticleRunDetail | null;
    apiKey: string;
  },
) {
  const artifact = useMemo(() => findSourceHealthArtifact(run), [run]);
  const memoryArtifact = useMemo(() => findEditorialMemoryArtifact(run), [run]);
  const [report, setReport] = useState<SourceHealthReport | null>(null);
  const [memory, setMemory] = useState<EditorialMemoryContext | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!artifact) {
      setReport(null);
      setError("");
      return;
    }
    setError("");
    apiArtifact(
      `/api/artifacts?key=${encodeURIComponent(artifact.key)}`,
      apiKey,
    )
      .then(async (response) =>
        setReport(JSON.parse(await response.text()) as SourceHealthReport)
      )
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, [artifact, apiKey]);

  useEffect(() => {
    if (!memoryArtifact) {
      setMemory(null);
      return;
    }
    apiArtifact(
      `/api/artifacts?key=${encodeURIComponent(memoryArtifact.key)}`,
      apiKey,
    )
      .then(async (response) =>
        setMemory(JSON.parse(await response.text()) as EditorialMemoryContext)
      )
      .catch(() => setMemory(null));
  }, [memoryArtifact, apiKey]);

  if (!run) {
    return (
      <section className="tp-section rounded-md border p-4">
        <SectionTitle
          title="最近一次抓取健康"
          description="运行一次 dry-run 后，这里会展示每个数据源的成功率和失败原因。"
        />
        <EmptyState>还没有运行记录</EmptyState>
      </section>
    );
  }

  if (!artifact) {
    return (
      <section className="tp-section rounded-md border p-4">
        <SectionTitle
          title="最近一次抓取健康"
          description="旧运行没有 source health 产物，新版本运行后会自动生成。"
        />
        <EmptyState>暂无抓取健康数据</EmptyState>
      </section>
    );
  }

  return (
    <section className="tp-section rounded-md border p-4">
      <SectionTitle
        title="最近一次抓取健康"
        description="优先处理 failed / empty 的源；长期失败的数据源会拖低文章质量。"
        action={<Badge>{run.runId.slice(0, 8)}</Badge>}
      />
      {error && (
        <div className="tp-danger rounded-md border p-3 text-sm">{error}</div>
      )}
      {report && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <MetricChip label="数据源" value={report.totalSources} />
            <MetricChip label="成功" value={report.succeeded} />
            <MetricChip label="失败" value={report.failed + report.empty} />
            <MetricChip label="文章" value={report.totalArticles} />
          </div>
          {memory?.sourcePerformance.length
            ? (
              <div className="rounded-md border border-[#e2e8f0] bg-[#ffffff]/55 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="tp-title text-sm font-semibold">
                    历史来源表现
                  </div>
                  <Badge>{memory.sourcePerformance.length} sources</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {memory.sourcePerformance.slice(0, 6).map((source) => {
                    const successRate = source.runs
                      ? Math.round((source.successes / source.runs) * 100)
                      : 0;
                    return (
                      <div
                        key={source.url}
                        className="rounded border border-[#e2e8f0] bg-[#ffffff]/70 p-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="tp-title min-w-0 truncate font-medium">
                            {hostLabel(source.url)}
                          </span>
                          <Badge
                            tone={source.lastStatus === "succeeded"
                              ? "success"
                              : "danger"}
                          >
                            {successRate}%
                          </Badge>
                        </div>
                        <div className="tp-muted mt-1">
                          {source.runs} 次 · {source.totalArticles} 篇 · 最近
                          {" "}
                          {source.lastStatus}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
            : null}
          <div className="grid gap-2">
            {report.records.map((record) => (
              <div
                key={`${record.group}-${record.url}`}
                className="rounded-md border border-[#e2e8f0] bg-[#ffffff]/55 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={record.status === "succeeded"
                          ? "success"
                          : "danger"}
                      >
                        {record.status}
                      </Badge>
                      <Badge>{record.group}</Badge>
                      {record.selectedProvider && (
                        <Badge tone="info">{record.selectedProvider}</Badge>
                      )}
                    </div>
                    <div className="tp-title mt-2 truncate text-sm font-medium">
                      {hostLabel(record.url)}
                    </div>
                    <div className="tp-muted mt-1 truncate text-xs">
                      {record.url}
                    </div>
                  </div>
                  <div className="text-right text-xs text-[#64748b]">
                    <div>{record.articleCount} 篇</div>
                    <div>{formatDuration(record.durationMs)}</div>
                  </div>
                </div>
                {record.failures.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {record.failures.slice(0, 2).map((failure) => (
                      <div
                        key={`${failure.provider}-${failure.message}`}
                        className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1 text-xs text-[#475569]"
                      >
                        {failure.provider}: {failure.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SourcesView(
  {
    sourceDrafts,
    fetchGroupDrafts,
    saving,
    onSourcesChange,
    onFetchGroupsChange,
    onSaveSources,
    onSaveFetchGroups,
  }: {
    sourceDrafts: SourceDraft[];
    fetchGroupDrafts: FetchGroupDraft[];
    saving: string;
    onSourcesChange: (value: SourceDraft[]) => void;
    onFetchGroupsChange: (value: FetchGroupDraft[]) => void;
    onSaveSources: () => void;
    onSaveFetchGroups: () => void;
  },
) {
  const groupNames = fetchGroupDrafts.map((group) => group.name).filter(
    Boolean,
  );
  const addSource = () =>
    onSourcesChange([
      ...sourceDrafts,
      {
        raw: "",
        url: "",
        group: groupNames[0] ?? "default",
        enabled: true,
      },
    ]);
  const updateSource = (
    index: number,
    patch: Partial<SourceDraft>,
  ) => {
    onSourcesChange(
      sourceDrafts.map((source, currentIndex) =>
        currentIndex === index ? { ...source, ...patch } : source
      ),
    );
  };
  const removeSource = (index: number) => {
    onSourcesChange(
      sourceDrafts.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const addFetchGroup = () =>
    onFetchGroupsChange([
      ...fetchGroupDrafts,
      { name: "web", providers: ["auto"] },
    ]);
  const updateFetchGroup = (
    index: number,
    patch: Partial<FetchGroupDraft>,
  ) => {
    onFetchGroupsChange(
      fetchGroupDrafts.map((group, currentIndex) =>
        currentIndex === index ? { ...group, ...patch } : group
      ),
    );
  };
  const toggleProvider = (groupIndex: number, provider: string) => {
    const group = fetchGroupDrafts[groupIndex];
    const exists = group.providers.includes(provider);
    const providers = exists
      ? group.providers.filter((item) => item !== provider)
      : [...group.providers, provider];
    updateFetchGroup(groupIndex, { providers });
  };
  const removeFetchGroup = (index: number) => {
    onFetchGroupsChange(
      fetchGroupDrafts.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <section className="tp-section min-w-0 rounded-md border p-4">
        <SectionTitle
          title="数据源"
          description="粘贴 URL，选择抓取策略。日常只维护这里，不需要手写 JSON。"
          action={
            <div className="flex gap-2">
              <Button size="sm" type="button" onClick={addSource}>
                <Plus className="size-3.5" />
                添加
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={onSaveSources}
                disabled={saving === "sources"}
              >
                <Save className="size-3.5" />
                保存
              </Button>
            </div>
          }
        />
        <div className="mb-3 grid gap-2 rounded-md border border-[var(--tp-border)] bg-[var(--tp-panel-muted)] p-3 text-xs text-[var(--tp-muted)] sm:grid-cols-3">
          <div>
            <span className="font-medium text-[var(--tp-ink)]">
              {sourceDrafts.length}
            </span>{" "}
            个来源
          </div>
          <div>
            <span className="font-medium text-[var(--tp-ink)]">
              {sourceDrafts.filter((source) => source.enabled).length}
            </span>{" "}
            个启用
          </div>
          <div className="truncate">
            默认策略:{" "}
            <span className="font-medium text-[var(--tp-ink)]">
              {groupNames[0] ?? "default"}
            </span>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-md border border-[var(--tp-border)]">
          <div className="hidden grid-cols-[52px_132px_minmax(0,1fr)_82px] border-b border-[var(--tp-border)] bg-[var(--tp-panel-muted)] px-3 py-2 text-xs font-medium text-[var(--tp-subtle)] md:grid">
            <div>状态</div>
            <div>分组</div>
            <div>URL</div>
            <div className="text-right">操作</div>
          </div>
          {sourceDrafts.length
            ? sourceDrafts.map((source, index) => (
              <div
                key={`${source.raw}-${index}`}
                className="grid min-w-0 gap-2 border-b border-[var(--tp-border)] bg-white px-3 py-3 last:border-b-0 md:grid-cols-[52px_132px_minmax(0,1fr)_82px] md:items-start"
              >
                <div className="flex items-center justify-between gap-2 md:block">
                  <label className="flex items-center gap-1.5 text-xs text-[var(--tp-muted)]">
                    <input
                      className="size-3.5 accent-[#0f172a]"
                      type="checkbox"
                      checked={source.enabled}
                      onChange={(event) =>
                        updateSource(index, {
                          enabled: event.currentTarget.checked,
                        })}
                    />
                    <span className="md:sr-only">启用</span>
                    <Badge tone={source.enabled ? "success" : "muted"}>
                      #{index + 1}
                    </Badge>
                  </label>
                  <div className="text-xs text-[var(--tp-subtle)] md:hidden">
                    {source.enabled ? "启用" : "停用"}
                  </div>
                </div>
                <Select
                  value={source.group}
                  onChange={(event) =>
                    updateSource(index, {
                      group: event.currentTarget.value,
                      raw: source.url
                        ? `${event.currentTarget.value}:${source.url}`
                        : source.raw,
                    })}
                >
                  {groupNames.length
                    ? groupNames.map((group) => (
                      <option key={group} value={group}>{group}</option>
                    ))
                    : <option value="default">default</option>}
                </Select>
                <div className="min-w-0">
                  <Input
                    placeholder="https://example.com/news"
                    value={source.url}
                    onChange={(event) =>
                      updateSource(index, {
                        url: event.currentTarget.value,
                        raw: source.group
                          ? `${source.group}:${event.currentTarget.value}`
                          : event.currentTarget.value,
                      })}
                  />
                  <div className="mt-1 truncate text-xs text-[var(--tp-subtle)]">
                    {source.url ? hostLabel(source.url) : "等待输入 URL"}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => removeSource(index)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))
            : <EmptyState>还没有数据源，点击“添加”开始。</EmptyState>}
        </div>
      </section>

      <section className="tp-section min-w-0 rounded-md border p-4">
        <SectionTitle
          title="抓取分组"
          description="分组决定一条 URL 会按什么顺序尝试抓取。普通网页保留 auto 即可。"
          action={
            <div className="flex gap-2">
              <Button size="sm" type="button" onClick={addFetchGroup}>
                <Plus className="size-3.5" />
                添加
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={onSaveFetchGroups}
                disabled={saving === "fetch-groups"}
              >
                <Save className="size-3.5" />
                保存
              </Button>
            </div>
          }
        />
        <div className="grid gap-2">
          {fetchGroupDrafts.length
            ? fetchGroupDrafts.map((group, groupIndex) => (
              <div
                key={`${group.name}-${groupIndex}`}
                className="min-w-0 rounded-md border border-[var(--tp-border)] bg-white p-3"
              >
                <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    value={group.name}
                    placeholder="default"
                    onChange={(event) =>
                      updateFetchGroup(groupIndex, {
                        name: event.currentTarget.value,
                      })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => removeFetchGroup(groupIndex)}
                  >
                    删除
                  </Button>
                </div>
                <div className="mb-3 rounded-md bg-[var(--tp-panel-muted)] px-3 py-2 text-xs text-[var(--tp-muted)]">
                  fallback 顺序:{" "}
                  <span className="font-medium text-[var(--tp-ink)]">
                    {group.providers.length
                      ? group.providers.join(" -> ")
                      : "未选择"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {FETCH_PROVIDER_OPTIONS.map((provider) => (
                    <label
                      key={`${group.name}-${provider}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--tp-border-strong)] bg-white px-2.5 text-xs text-[var(--tp-muted)]"
                    >
                      <input
                        className="size-3.5 accent-[#0f172a]"
                        type="checkbox"
                        checked={group.providers.includes(provider)}
                        onChange={() => toggleProvider(groupIndex, provider)}
                      />
                      {provider}
                    </label>
                  ))}
                </div>
              </div>
            ))
            : <EmptyState>还没有抓取分组</EmptyState>}
        </div>
      </section>
    </div>
  );
}

function CapabilitiesView(
  { capabilities, apiKey, onReload }: {
    capabilities: CapabilityProfile[];
    apiKey: string;
    onReload: () => Promise<void>;
  },
) {
  const groupedCapabilities = capabilities.reduce<
    Record<string, CapabilityProfile[]>
  >(
    (groups, capability) => {
      groups[capability.kind] = [
        ...(groups[capability.kind] ?? []),
        capability,
      ];
      return groups;
    },
    {},
  );
  const entries = Object.entries(groupedCapabilities);
  const [editing, setEditing] = useState<CapabilityFormDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const saveCapability = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const existing = capabilities.some((item) => item.id === editing.id);
      await apiJson(
        existing
          ? `/api/config/capabilities/${encodeURIComponent(editing.id)}`
          : "/api/config/capabilities",
        apiKey,
        {
          method: existing ? "PATCH" : "POST",
          body: JSON.stringify({
            id: editing.id,
            kind: editing.kind,
            name: editing.name,
            enabled: editing.enabled,
            provider: editing.provider ||
              providerForCapabilityKind(editing.kind),
            config: capabilityConfigFromDraft(editing),
          }),
        },
      );
      setEditing(null);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteCapability = async (capability: CapabilityProfile) => {
    if (
      !confirm(
        `删除能力配置「${capability.name}」？如果它正在被文章方案引用，后续运行可能失败。`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiJson(
        `/api/config/capabilities/${encodeURIComponent(capability.id)}`,
        apiKey,
        { method: "DELETE" },
      );
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="tp-section rounded-md border p-4">
        <SectionTitle
          title="共享能力"
          description="这里配置可复用能力：大模型、图片生成、通知、抓取策略和向量去重。密钥不在控制台保存。"
          action={
            <Button
              size="sm"
              type="button"
              onClick={() => setEditing(capabilityDraftFromProfile())}
            >
              <Plus className="size-3.5" />
              新增能力
            </Button>
          }
        />
        {error && (
          <div className="tp-danger mb-3 rounded-md border p-3 text-sm">
            {error}
          </div>
        )}
        {editing && (
          <div className="mb-4 rounded-md border border-[#cbd5e1] bg-[#ffffff]/72 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="tp-title text-sm font-semibold">
                  {capabilities.some((item) => item.id === editing.id)
                    ? "编辑能力"
                    : "新增能力"}
                </div>
                <div className="tp-muted text-xs">
                  这里只保存非敏感参数，API Key 仍来自部署配置。
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                取消
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="tp-muted text-xs font-medium">名称</span>
                <Input
                  value={editing.name}
                  onChange={(event) =>
                    setEditing({ ...editing, name: event.currentTarget.value })}
                />
              </label>
              <label className="space-y-1.5">
                <span className="tp-muted text-xs font-medium">类型</span>
                <Select
                  value={editing.kind}
                  onChange={(event) => {
                    const kind = event.currentTarget.value;
                    setEditing({
                      ...editing,
                      kind,
                      provider: providerForCapabilityKind(kind),
                    });
                  }}
                >
                  {CAPABILITY_KIND_OPTIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {capabilityKindLabel(kind)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="tp-muted text-xs font-medium">能力提供方</span>
                <Input
                  value={editing.provider}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      provider: event.currentTarget.value,
                    })}
                />
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  className="size-4 accent-[#0f172a]"
                  type="checkbox"
                  checked={editing.enabled}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      enabled: event.currentTarget.checked,
                    })}
                />
                启用
              </label>
              {(editing.kind === "llm" ||
                editing.kind === "embedding" ||
                editing.kind === "image-generation") && (
                <label className="space-y-1.5">
                  <span className="tp-muted text-xs font-medium">模型</span>
                  <Input
                    value={editing.model}
                    placeholder="例如 MiniMax-M2.7 / qwen-image-2.0-pro"
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        model: event.currentTarget.value,
                      })}
                  />
                </label>
              )}
              {editing.kind === "image-generation" && (
                <>
                  <label className="space-y-1.5">
                    <span className="tp-muted text-xs font-medium">
                      默认数量
                    </span>
                    <Input
                      type="number"
                      min="1"
                      max="4"
                      value={editing.count}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          count: event.currentTarget.value,
                        })}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="tp-muted text-xs font-medium">尺寸</span>
                    <Input
                      value={editing.size}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          size: event.currentTarget.value,
                        })}
                    />
                  </label>
                </>
              )}
              {editing.kind === "notification" && (
                <div className="space-y-2 sm:col-span-2">
                  <div className="tp-muted text-xs font-medium">通知渠道</div>
                  <div className="flex flex-wrap gap-2">
                    {NOTIFICATION_CHANNEL_OPTIONS.map((channel) => (
                      <label
                        key={channel}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#cbd5e1] bg-[#ffffff]/70 px-2.5 text-xs text-[#4b4035]"
                      >
                        <input
                          className="size-3.5 accent-[#0f172a]"
                          type="checkbox"
                          checked={editing.channels.includes(channel)}
                          onChange={(event) => {
                            const channels = event.currentTarget.checked
                              ? [...editing.channels, channel]
                              : editing.channels.filter((item) =>
                                item !== channel
                              );
                            setEditing({ ...editing, channels });
                          }}
                        />
                        {channel}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="primary"
                onClick={saveCapability}
                disabled={saving}
              >
                <Save className="size-3.5" />
                保存能力
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {entries.length
          ? entries.map(([kind, items]) => (
            <section
              key={kind}
              className="tp-section min-w-0 rounded-md border p-4"
            >
              <SectionTitle
                title={capabilityKindLabel(kind)}
                description={`${items.length} 个配置 · ${
                  capabilityKindDescription(kind)
                }`}
              />
              <div className="grid min-w-0 gap-2">
                {items.map((capability) => (
                  <div
                    key={capability.id}
                    className="min-w-0 overflow-hidden rounded-md border border-[#e2e8f0] bg-[#ffffff]/55 p-3"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="tp-title truncate text-sm font-semibold">
                          {capability.name}
                        </div>
                        <div className="tp-muted truncate text-xs">
                          {capability.id}
                        </div>
                      </div>
                      <Badge
                        tone={capability.enabled ? "success" : "muted"}
                        className="max-w-[46%] shrink-0 px-2.5"
                        title={capability.provider}
                      >
                        <span className="min-w-0 truncate">
                          {capability.provider}
                        </span>
                      </Badge>
                    </div>
                    <div className="tp-subtle truncate text-xs">
                      {compactConfig(capability.config)}
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          setEditing(capabilityDraftFromProfile(capability))}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteCapability(capability)}
                        disabled={saving}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
          : <EmptyState>还没有能力配置</EmptyState>}
      </div>
    </div>
  );
}

function RuntimeConfigPanel(
  {
    apiKey,
    profiles,
    capabilities,
    latestRun,
    mode = "settings",
    selectedProfileId,
    onSelectProfile,
    onReload,
  }: {
    apiKey: string;
    profiles: ArticleRuntimeProfileDetail[];
    capabilities: CapabilityProfile[];
    latestRun?: ArticleRunDetail | null;
    mode?: "trend" | "sources" | "settings";
    selectedProfileId: string;
    onSelectProfile: (profileId: string) => void;
    onReload: () => Promise<void>;
  },
) {
  const selected =
    profiles.find((item) => item.profile.id === selectedProfileId) ??
      profiles[0];
  const [articleJson, setArticleJson] = useState("");
  const [showAdvancedJson, setShowAdvancedJson] = useState(false);
  const [sourceDrafts, setSourceDrafts] = useState<SourceDraft[]>([]);
  const [fetchGroupDrafts, setFetchGroupDrafts] = useState<FetchGroupDraft[]>(
    [],
  );
  const [profileMeta, setProfileMeta] = useState({
    name: "",
    enabled: true,
    isDefault: false,
  });
  const [schedule, setSchedule] = useState({
    enabled: true,
    cron: "0 3 * * *",
    timezone: "Asia/Shanghai",
    dryRun: true,
  });
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selected) return;
    setArticleJson(JSON.stringify(selected.article, null, 2));
    setProfileMeta({
      name: selected.profile.name,
      enabled: selected.profile.enabled,
      isDefault: selected.profile.isDefault,
    });
    setSourceDrafts(selected.sources.map((source) => ({
      raw: source.raw,
      url: source.url,
      group: source.group,
      enabled: source.enabled,
    })));
    setFetchGroupDrafts(
      Object.entries(selected.fetchGroups).map(([name, providers]) => ({
        name,
        providers,
      })),
    );
    setSchedule({
      enabled: selected.schedule?.enabled ?? true,
      cron: selected.schedule?.cron ?? "0 3 * * *",
      timezone: selected.schedule?.timezone ?? "Asia/Shanghai",
      dryRun: selected.schedule?.dryRun ?? true,
    });
    setError("");
  }, [selected]);

  const saveArticlePatch = async (article: Record<string, unknown>) => {
    if (!selected) return;
    setSaving("article");
    setError("");
    try {
      await apiJson(
        `/api/config/features/article/profiles/${
          encodeURIComponent(selected.profile.id)
        }`,
        apiKey,
        {
          method: "PATCH",
          body: JSON.stringify({ article }),
        },
      );
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving("");
    }
  };

  const saveArticle = async () => {
    await saveArticlePatch(JSON.parse(articleJson));
  };

  const saveProfileMeta = async () => {
    if (!selected) return;
    setSaving("profile-meta");
    setError("");
    try {
      await apiJson(
        `/api/config/features/article/profiles/${
          encodeURIComponent(selected.profile.id)
        }`,
        apiKey,
        {
          method: "PATCH",
          body: JSON.stringify(profileMeta),
        },
      );
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving("");
    }
  };

  const saveSources = async () => {
    if (!selected) return;
    setSaving("sources");
    setError("");
    try {
      await apiJson(
        `/api/config/features/article/profiles/${
          encodeURIComponent(selected.profile.id)
        }/sources`,
        apiKey,
        {
          method: "PUT",
          body: JSON.stringify({
            sources: sourceDrafts
              .filter((source) => source.url.trim())
              .map((source, index) => ({
                raw: source.raw || `${source.group}:${source.url}`,
                url: source.url.trim(),
                group: source.group || "default",
                enabled: source.enabled,
                position: index,
              })),
          }),
        },
      );
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving("");
    }
  };

  const saveFetchGroups = async () => {
    if (!selected) return;
    setSaving("fetch-groups");
    setError("");
    try {
      await apiJson(
        `/api/config/features/article/profiles/${
          encodeURIComponent(selected.profile.id)
        }/fetch-groups`,
        apiKey,
        {
          method: "PUT",
          body: JSON.stringify({
            fetchGroups: Object.fromEntries(
              fetchGroupDrafts
                .filter((group) => group.name.trim())
                .map((group) => [
                  group.name.trim(),
                  group.providers.length ? group.providers : ["auto"],
                ]),
            ),
          }),
        },
      );
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving("");
    }
  };

  const saveSchedule = async () => {
    if (!selected) return;
    setSaving("schedule");
    setError("");
    try {
      await apiJson(
        `/api/config/features/article/profiles/${
          encodeURIComponent(selected.profile.id)
        }/schedule`,
        apiKey,
        {
          method: "PUT",
          body: JSON.stringify(schedule),
        },
      );
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving("");
    }
  };

  const createProfile = async () => {
    setSaving("profile");
    setError("");
    try {
      const data = await apiJson<{ profile: ArticleRuntimeProfileDetail }>(
        "/api/config/features/article/profiles",
        apiKey,
        {
          method: "POST",
          body: JSON.stringify({
            copyFromProfileId: selected?.profile.id,
            name: selected ? `${selected.profile.name} 副本` : "新微信文章",
          }),
        },
      );
      onSelectProfile(data.profile.profile.id);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving("");
    }
  };

  const deleteProfile = async () => {
    if (!selected || selected.profile.isDefault) return;
    const confirmed = globalThis.confirm(
      `删除文章方案「${selected.profile.name}」？数据源、抓取分组和定时规则也会一起删除。`,
    );
    if (!confirmed) return;
    setSaving("profile");
    setError("");
    try {
      await apiJson(
        `/api/config/features/article/profiles/${
          encodeURIComponent(selected.profile.id)
        }`,
        apiKey,
        { method: "DELETE" },
      );
      const fallback = profiles.find((item) => item.profile.isDefault) ??
        profiles.find((item) => item.profile.id !== selected.profile.id);
      if (fallback) onSelectProfile(fallback.profile.id);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving("");
    }
  };

  const article = asRecord(selected?.article);
  const panelCopy = {
    trend: {
      title: "微信文章方案",
      description: "调整本次文章工作流的模板、数量、配图、发布与去重参数。",
    },
    sources: {
      title: "数据源与抓取策略",
      description: "维护 URL 列表和 fetchGroups，保存后下一次运行生效。",
    },
    settings: {
      title: "运行时配置",
      description: "业务配置保存在 SQLite/D1；密钥仍由部署环境管理。",
    },
  }[mode];

  return (
    <div className="space-y-4">
      <div className="tp-command rounded-lg border p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Settings className="size-4 text-[#64748b]" />
              <h2 className="tp-title text-base font-semibold">
                {panelCopy.title}
              </h2>
            </div>
            <p className="tp-muted text-sm">{panelCopy.description}</p>
          </div>
          <div className="flex gap-2">
            <Select
              value={selected?.profile.id ?? ""}
              onChange={(event) => onSelectProfile(event.currentTarget.value)}
            >
              {profiles.map((item) => (
                <option value={item.profile.id} key={item.profile.id}>
                  {item.profile.name}
                  {item.profile.isDefault ? " · 默认" : ""}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              onClick={createProfile}
              disabled={saving === "profile"}
            >
              <Plus className="size-3.5" />
              复制
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={deleteProfile}
              disabled={saving === "profile" || !selected ||
                selected.profile.isDefault}
            >
              删除
            </Button>
          </div>
        </div>
        {selected && (
          <div className="mt-4 grid gap-2 border-t border-[#e2e8f0] pt-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <Input
              value={profileMeta.name}
              onChange={(event) =>
                setProfileMeta({
                  ...profileMeta,
                  name: event.currentTarget.value,
                })}
              placeholder="文章方案名称"
            />
            <label className="flex h-[34px] items-center gap-2 rounded-md border border-[#cbd5e1] bg-[#ffffff]/60 px-3 text-xs text-[#475569]">
              <input
                className="size-3.5 accent-[#0f172a]"
                type="checkbox"
                checked={profileMeta.enabled}
                onChange={(event) =>
                  setProfileMeta({
                    ...profileMeta,
                    enabled: event.currentTarget.checked,
                  })}
              />
              启用
            </label>
            <label className="flex h-[34px] items-center gap-2 rounded-md border border-[#cbd5e1] bg-[#ffffff]/60 px-3 text-xs text-[#475569]">
              <input
                className="size-3.5 accent-[#0f172a]"
                type="checkbox"
                checked={profileMeta.isDefault}
                disabled={selected.profile.isDefault}
                onChange={(event) =>
                  setProfileMeta({
                    ...profileMeta,
                    isDefault: event.currentTarget.checked,
                  })}
              />
              默认
            </label>
            <Button
              size="sm"
              onClick={saveProfileMeta}
              disabled={saving === "profile-meta"}
            >
              <Save className="size-3.5" />
              保存方案
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="tp-danger mb-4 rounded-md border p-3 text-sm">
          {error}
        </div>
      )}

      {mode === "trend" && (
        <TrendProfileView
          article={article}
          capabilities={capabilities}
          saving={saving}
          onSave={saveArticlePatch}
        />
      )}

      {mode === "sources" && (
        <div className="space-y-4">
          <SourceHealthPanel
            run={latestRun ?? null}
            apiKey={apiKey}
          />
          <SourcesView
            sourceDrafts={sourceDrafts}
            fetchGroupDrafts={fetchGroupDrafts}
            saving={saving}
            onSourcesChange={setSourceDrafts}
            onFetchGroupsChange={setFetchGroupDrafts}
            onSaveSources={saveSources}
            onSaveFetchGroups={saveFetchGroups}
          />
        </div>
      )}

      {mode === "settings" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
          <section className="tp-section rounded-md border p-4">
            <SectionTitle
              title="高级配置 JSON"
              description="只在需要精确调试时打开。新手通常不需要编辑这里。"
              action={
                <Button
                  size="sm"
                  type="button"
                  onClick={() => setShowAdvancedJson(!showAdvancedJson)}
                >
                  {showAdvancedJson ? "收起" : "展开"}
                </Button>
              }
            />
            {showAdvancedJson
              ? (
                <div className="space-y-3">
                  <Textarea
                    className="min-h-80 font-mono text-xs"
                    value={articleJson}
                    onChange={(event) =>
                      setArticleJson(event.currentTarget.value)}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={saveArticle}
                      disabled={saving === "article"}
                    >
                      <Save className="size-3.5" />
                      保存 JSON
                    </Button>
                  </div>
                </div>
              )
              : (
                <div className="tp-card-soft rounded-md border p-3 text-sm text-[#64748b]">
                  高级 JSON 已隐藏。日常配置请使用微信 Trend
                  和数据源页面；共享能力在当前设置页下方维护。
                </div>
              )}
          </section>

          <div className="space-y-4">
            <section className="tp-section rounded-md border p-4">
              <SectionTitle
                title="定时"
                description="本地、Docker、远程部署的 heartbeat 都会读取这里的规则。"
                action={
                  <Button
                    size="sm"
                    onClick={saveSchedule}
                    disabled={saving === "schedule"}
                  >
                    <Save className="size-3.5" />
                    保存
                  </Button>
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="tp-muted text-xs font-medium">Cron</span>
                  <Input
                    value={schedule.cron}
                    onChange={(event) =>
                      setSchedule({
                        ...schedule,
                        cron: event.currentTarget.value,
                      })}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="tp-muted text-xs font-medium">时区</span>
                  <Input
                    value={schedule.timezone}
                    onChange={(event) =>
                      setSchedule({
                        ...schedule,
                        timezone: event.currentTarget.value,
                      })}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    className="size-4 accent-[#0f172a]"
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(event) =>
                      setSchedule({
                        ...schedule,
                        enabled: event.currentTarget.checked,
                      })}
                  />
                  启用定时
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    className="size-4 accent-[#0f172a]"
                    type="checkbox"
                    checked={schedule.dryRun}
                    onChange={(event) =>
                      setSchedule({
                        ...schedule,
                        dryRun: event.currentTarget.checked,
                      })}
                  />
                  定时 dry-run
                </label>
              </div>
            </section>

            <CapabilitiesView
              capabilities={capabilities}
              apiKey={apiKey}
              onReload={onReload}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TriggerRunDialog(
  { open, profiles, onClose, onSubmit }: {
    open: boolean;
    profiles: ArticleRuntimeProfileDetail[];
    onClose: () => void;
    onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  },
) {
  const [dryRun, setDryRun] = useState(true);
  const [maxArticles, setMaxArticles] = useState("10");
  const [sourceType, setSourceType] = useState("all");
  const [profileId, setProfileId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;
  const canSubmit = dryRun || confirmed;
  const effectiveProfileId = profileId ||
    profiles.find((item) => item.profile.isDefault)?.profile.id ||
    profiles[0]?.profile.id;

  return (
    <div className="tp-overlay fixed inset-0 z-40 grid place-items-center p-4 backdrop-blur-sm">
      <form
        className="tp-panel w-full max-w-lg rounded-lg border p-5 shadow-xl"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canSubmit) return;
          setSubmitting(true);
          try {
            await onSubmit({
              dryRun,
              forcePublish: !dryRun,
              maxArticles: Number(maxArticles) || undefined,
              sourceType,
              profileId: effectiveProfileId,
            });
            onClose();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="mb-5">
          <h2 className="tp-title text-lg font-semibold">
            触发微信文章工作流
          </h2>
          <p className="tp-muted mt-1 text-sm">
            建议先 dry-run 检查产物，再创建微信公众号草稿。
          </p>
        </div>
        <div className="space-y-4">
          <label className="tp-section flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="tp-title text-sm font-medium">
                Dry-run
              </div>
              <div className="tp-muted text-xs">
                不上传图片，不创建微信草稿，只生成可预览产物。
              </div>
            </div>
            <input
              className="size-4 accent-[#0f172a]"
              type="checkbox"
              checked={dryRun}
              onChange={(event) => {
                setDryRun(event.currentTarget.checked);
                setConfirmed(false);
              }}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="tp-muted text-xs font-medium">文章方案</span>
              <Select
                value={effectiveProfileId ?? ""}
                onChange={(event) => setProfileId(event.currentTarget.value)}
              >
                {profiles.map((item) => (
                  <option value={item.profile.id} key={item.profile.id}>
                    {item.profile.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="tp-muted text-xs font-medium">
                文章数量
              </span>
              <Input
                type="number"
                min="1"
                max="30"
                value={maxArticles}
                onChange={(event) => setMaxArticles(event.currentTarget.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="tp-muted text-xs font-medium">数据源</span>
              <Select
                value={sourceType}
                onChange={(event) => setSourceType(event.currentTarget.value)}
              >
                <option value="all">全部</option>
                <option value="firecrawl">网页</option>
                <option value="jina">Jina Reader</option>
                <option value="jina-search">Jina Search</option>
                <option value="brave-search">Brave Search</option>
                <option value="tavily-search">Tavily</option>
                <option value="exa-search">Exa</option>
                <option value="serper-search">Serper</option>
                <option value="newsapi">NewsAPI</option>
                <option value="gdelt">GDELT</option>
                <option value="hackernews">Hacker News</option>
                <option value="arxiv">arXiv</option>
                <option value="twitter">Twitter/X</option>
                <option value="rss">RSS</option>
              </Select>
            </label>
          </div>
          {!dryRun && (
            <div className="tp-warning rounded-md border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <AlertCircle className="size-4" />
                将创建微信公众号草稿
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  className="mt-1 size-4 accent-[#2563eb]"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) =>
                    setConfirmed(event.currentTarget.checked)}
                />
                我确认要执行真实发布流程，并创建微信公众号草稿。
              </label>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            type="submit"
            variant={dryRun ? "primary" : "danger"}
            disabled={!canSubmit || submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {dryRun ? "开始 dry-run" : "确认创建草稿"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function App() {
  const [apiKey, setApiKey] = useState(() =>
    sessionStorage.getItem(API_KEY_STORAGE) ?? ""
  );
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [config, setConfig] = useState<ConfigSummary | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityProfile[]>([]);
  const [articleProfiles, setArticleProfiles] = useState<
    ArticleRuntimeProfileDetail[]
  >([]);
  const [selectedConfigProfileId, setSelectedConfigProfileId] = useState("");
  const [runs, setRuns] = useState<ArticleRunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<ArticleRunDetail | null>(null);
  const [filter, setFilter] = useState<"all" | RunStatus>("all");
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<DashboardView>("home");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<ArtifactRef | null>(
    null,
  );

  const saveApiKey = useCallback((nextApiKey: string) => {
    sessionStorage.setItem(API_KEY_STORAGE, nextApiKey);
    setLoginError("");
    setError("");
    setApiKey(nextApiKey);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(API_KEY_STORAGE);
    setApiKey("");
    setHealth(null);
    setConfig(null);
    setCapabilities([]);
    setArticleProfiles([]);
    setSelectedConfigProfileId("");
    setRuns([]);
    setSelectedRun(null);
    setSelectedRunId(null);
  }, []);

  const rejectApiKey = useCallback((message = "API Key 无效，请重新输入。") => {
    sessionStorage.removeItem(API_KEY_STORAGE);
    setApiKey("");
    setLoginError(message);
    setError("");
    setHealth(null);
    setConfig(null);
    setCapabilities([]);
    setArticleProfiles([]);
    setRuns([]);
    setSelectedRun(null);
    setSelectedRunId(null);
  }, []);

  const loadRuns = useCallback(async () => {
    if (!apiKey) return;
    const data = await apiJson<{ runs: ArticleRunRecord[] }>(
      "/api/runs",
      apiKey,
    );
    setRuns(data.runs);
    if (!selectedRunId && data.runs[0]) {
      setSelectedRunId(data.runs[0].runId);
    }
  }, [apiKey, selectedRunId]);

  const loadSelectedRun = useCallback(async (runId: string | null) => {
    if (!apiKey || !runId) return;
    const data = await apiJson<{ run: ArticleRunDetail }>(
      `/api/runs/${encodeURIComponent(runId)}`,
      apiKey,
    );
    setSelectedRun(data.run);
  }, [apiKey]);

  const refresh = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError("");
    try {
      const [healthData, configData] = await Promise.all([
        apiJson<HealthResponse>("/api/health", apiKey),
        apiJson<ConfigSummary>("/api/config/summary", apiKey),
      ]);
      const [capabilitiesData, profilesData] = await Promise.all([
        apiJson<{ capabilities: CapabilityProfile[] }>(
          "/api/config/capabilities",
          apiKey,
        ),
        apiJson<{ profiles: ArticleRuntimeProfileDetail[] }>(
          "/api/config/features/article/profiles",
          apiKey,
        ),
      ]);
      setHealth(healthData);
      setConfig(configData);
      setCapabilities(capabilitiesData.capabilities);
      setArticleProfiles(profilesData.profiles);
      setSelectedConfigProfileId((current) =>
        current || profilesData.profiles.find((item) => item.profile.isDefault)
          ?.profile.id ||
        profilesData.profiles[0]?.profile.id || ""
      );
      await loadRuns();
      await loadSelectedRun(selectedRunId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("未授权") || message.includes("Authorization")) {
        rejectApiKey("API Key 无效或已失效，请重新输入。");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [apiKey, loadRuns, loadSelectedRun, rejectApiKey, selectedRunId]);

  useEffect(() => {
    if (!apiKey) return;
    refresh();
  }, [apiKey]);

  useEffect(() => {
    loadSelectedRun(selectedRunId);
  }, [loadSelectedRun, selectedRunId]);

  useEffect(() => {
    if (!apiKey || !autoRefresh) return;
    const timer = setInterval(() => {
      refresh();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [apiKey, autoRefresh, refresh]);

  const latestRun = runs[0];
  const currentView = VIEW_META[activeView];
  const showRuntimeConfig = articleProfiles.length > 0;

  if (!apiKey) return <LoginView onLogin={saveApiKey} error={loginError} />;

  return (
    <main className="tp-surface min-h-screen text-[#0f172a]">
      <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <Sidebar
          config={config}
          latestRun={latestRun}
          activeView={activeView}
          onChange={setActiveView}
        />

        <section className="min-w-0">
          <header className="tp-header sticky top-0 z-20 border-b backdrop-blur">
            <div className="px-4 py-2.5 lg:px-5">
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-md bg-[#f38020] text-white lg:hidden">
                    <Rocket className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="hidden h-1.5 w-1.5 rounded-full bg-[#f38020] lg:block" />
                      <h1 className="tp-title truncate text-lg font-semibold lg:text-xl">
                        {currentView.title}
                      </h1>
                    </div>
                    <p className="tp-muted text-sm">
                      {currentView.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="hidden h-[32px] items-center gap-2 rounded-md border border-[#cbd5e1] bg-white px-2.5 text-xs text-[#475569] sm:flex">
                    <input
                      className="size-3.5 accent-[#2563eb]"
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(event) =>
                        setAutoRefresh(event.currentTarget.checked)}
                    />
                    自动刷新
                  </label>
                  <Button size="sm" onClick={refresh} disabled={loading}>
                    <RefreshCw
                      className={cx("size-3.5", loading && "animate-spin")}
                    />
                    刷新
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setTriggerOpen(true)}
                  >
                    <Play className="size-3.5" />
                    运行
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    aria-label="Notifications"
                    className="size-[32px]"
                  >
                    <Bell className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={logout}>
                    <span className="grid size-5 place-items-center rounded-full bg-[#eff6ff] text-[11px] font-semibold text-[#2563eb]">
                      T
                    </span>
                    <span className="hidden sm:inline">退出</span>
                    <LogOut className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 lg:hidden">
                <FeatureNav
                  config={config}
                  latestRun={latestRun}
                  activeView={activeView}
                  onChange={setActiveView}
                />
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1360px] space-y-4 px-4 py-4 lg:px-6 lg:py-5">
            {error && (
              <div className="tp-danger rounded-md border p-3 text-sm">
                {error}
              </div>
            )}

            {activeView === "home" && (
              <ArticleWorkbenchHome
                health={health}
                config={config}
                latestRun={latestRun}
                onNavigate={setActiveView}
                onRun={() => setTriggerOpen(true)}
              />
            )}

            {activeView === "trend" && (
              showRuntimeConfig
                ? (
                  <RuntimeConfigPanel
                    mode="trend"
                    apiKey={apiKey}
                    profiles={articleProfiles}
                    capabilities={capabilities}
                    latestRun={selectedRun}
                    selectedProfileId={selectedConfigProfileId}
                    onSelectProfile={setSelectedConfigProfileId}
                    onReload={refresh}
                  />
                )
                : <EmptyState>还没有可编辑的微信文章方案</EmptyState>
            )}

            {activeView === "sources" && (
              showRuntimeConfig
                ? (
                  <RuntimeConfigPanel
                    mode="sources"
                    apiKey={apiKey}
                    profiles={articleProfiles}
                    capabilities={capabilities}
                    latestRun={selectedRun}
                    selectedProfileId={selectedConfigProfileId}
                    onSelectProfile={setSelectedConfigProfileId}
                    onReload={refresh}
                  />
                )
                : <EmptyState>还没有可编辑的数据源配置</EmptyState>
            )}

            {activeView === "quality" && (
              <ArticleQualityWorkspace
                run={selectedRun}
                apiKey={apiKey}
                onPreviewArtifact={setPreviewArtifact}
              />
            )}

            {activeView === "runs" && (
              <RunsWorkspace
                runs={runs}
                selectedRunId={selectedRunId}
                selectedRun={selectedRun}
                filter={filter}
                setFilter={setFilter}
                query={query}
                setQuery={setQuery}
                onSelectRun={setSelectedRunId}
                apiKey={apiKey}
                profileId={selectedConfigProfileId}
                onPreviewArtifact={setPreviewArtifact}
              />
            )}

            {activeView === "artifacts" && (
              <ArtifactsPanel
                run={selectedRun}
                onPreviewArtifact={setPreviewArtifact}
              />
            )}

            {activeView === "settings" && (
              showRuntimeConfig
                ? (
                  <RuntimeConfigPanel
                    mode="settings"
                    apiKey={apiKey}
                    profiles={articleProfiles}
                    capabilities={capabilities}
                    selectedProfileId={selectedConfigProfileId}
                    onSelectProfile={setSelectedConfigProfileId}
                    onReload={refresh}
                  />
                )
                : <EmptyState>还没有可编辑的运行时配置</EmptyState>
            )}
          </div>
        </section>
      </div>

      <TriggerRunDialog
        open={triggerOpen}
        profiles={articleProfiles}
        onClose={() => setTriggerOpen(false)}
        onSubmit={async (payload) => {
          await apiJson<{ success: boolean; runId: string }>(
            "/api/runs",
            apiKey,
            {
              method: "POST",
              body: JSON.stringify(payload),
            },
          );
          await refresh();
        }}
      />
      <ArtifactPreview
        artifact={previewArtifact}
        apiKey={apiKey}
        onClose={() => setPreviewArtifact(null)}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
