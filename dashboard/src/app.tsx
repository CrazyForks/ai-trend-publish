import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  FileJson,
  FileText,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import "./styles.css";

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
  };
  storage: {
    artifacts: string;
    runState: string;
    vector: string;
  };
  fetchGroups: string[];
  providersConfigured: Record<string, boolean>;
}

interface ApiErrorPayload {
  error?: string | { message?: string; data?: { error?: string } };
}

const API_KEY_STORAGE = "trendpublish.dashboard.apiKey";
const AUTO_REFRESH_MS = 8000;

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

function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger" | "ghost";
  },
) {
  const { className, variant = "secondary", ...rest } = props;
  return (
    <button
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200",
        variant === "secondary" &&
          "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        variant === "ghost" &&
          "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
        className,
      )}
      {...rest}
    />
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-600 dark:focus:ring-zinc-800",
        props.className,
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
        props.className,
      )}
    />
  );
}

function Badge(
  { children, tone = "muted" }: {
    children: React.ReactNode;
    tone?: "success" | "danger" | "info" | "muted";
  },
) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "success" &&
          "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
        tone === "danger" &&
          "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
        tone === "info" &&
          "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900",
        tone === "muted" &&
          "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800",
      )}
    >
      {children}
    </span>
  );
}

function Card(
  { children, className }: { children: React.ReactNode; className?: string },
) {
  return (
    <section
      className={cx(
        "rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
    >
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      {children}
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: (apiKey: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              TrendPublish Dashboard
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              输入 server.apiKey 进入运行控制台
            </p>
          </div>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const apiKey = value.trim();
            if (apiKey) onLogin(apiKey);
          }}
        >
          <Input
            type="password"
            placeholder="Bearer API Key"
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            autoFocus
          />
          <Button className="w-full" variant="primary" type="submit">
            进入控制台
          </Button>
        </form>
      </Card>
    </main>
  );
}

function Overview(
  { health, config }: {
    health: HealthResponse | null;
    config: ConfigSummary | null;
  },
) {
  const checks = health ? Object.entries(health.checks) : [];
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              运行环境
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Dashboard 只展示脱敏配置和运行状态
            </p>
          </div>
          {health && (
            <Badge tone={health.ok ? "success" : "danger"}>
              {health.ok ? "healthy" : "unhealthy"}
            </Badge>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="模式" value={health?.mode ?? config?.mode ?? "-"} />
          <Metric
            label="模板"
            value={config?.article.renderer.template ?? "-"}
          />
          <Metric
            label="提示词"
            value={config?.article.renderer.promptProfile ?? "-"}
          />
          <Metric
            label="默认发布"
            value={config?.article.dryRunDefault ? "dry-run" : "创建草稿"}
          />
          <Metric
            label="数据源"
            value={`${config?.article.sourcesCount ?? 0} 个`}
          />
          <Metric
            label="存储"
            value={config
              ? `${config.storage.artifacts} / ${config.storage.runState}`
              : "-"}
          />
        </div>
      </Card>
      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-950 dark:text-zinc-50">
          健康检查
        </h2>
        {checks.length
          ? (
            <div className="space-y-3">
              {checks.map(([name, check]) => (
                <div className="flex items-start gap-3" key={name}>
                  <div
                    className={cx(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                      check.ok
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950"
                        : "bg-red-50 text-red-600 dark:bg-red-950",
                    )}
                  >
                    {check.ok
                      ? <CheckCircle2 className="size-4" />
                      : <AlertCircle className="size-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                      {name}
                    </div>
                    <div className="break-words text-xs text-zinc-500 dark:text-zinc-400">
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
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
        {value}
      </div>
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
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            运行记录
          </h2>
          <Badge>{runs.length}</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-zinc-400" />
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
      <div className="max-h-[680px] overflow-auto p-2">
        {filtered.length
          ? filtered.map((run) => (
            <button
              type="button"
              key={run.runId}
              className={cx(
                "mb-2 w-full rounded-md border p-3 text-left transition",
                run.runId === selectedRunId
                  ? "border-zinc-950 bg-zinc-50 dark:border-zinc-200 dark:bg-zinc-900"
                  : "border-transparent hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-800 dark:hover:bg-zinc-900",
              )}
              onClick={() => onSelect(run.runId)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  {run.runId}
                </div>
                <Badge tone={statusTone(run.status)}>
                  {statusIcon(run.status)}
                  {run.status}
                </Badge>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {run.mode} · {run.trigger} ·{" "}
                {run.dryRun ? "dry-run" : "publish"}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
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
    onPreviewArtifact,
  }: {
    run: ArticleRunDetail | null;
    onPreviewArtifact: (artifact: ArtifactRef) => void;
  },
) {
  const artifacts = useMemo(() => {
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
  }, [run]);

  if (!run) {
    return (
      <Card>
        <EmptyState>选择一条运行记录查看详情</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
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
            <h2 className="break-all text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {run.runId}
            </h2>
            {run.summary && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {run.summary}
              </p>
            )}
            {run.error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {run.error}
              </div>
            )}
          </div>
          <div className="grid min-w-60 gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <div>创建：{formatDate(run.createdAt)}</div>
            <div>更新：{formatDate(run.updatedAt)}</div>
            <div>完成：{formatDate(run.finishedAt)}</div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            步骤时间线
          </h3>
          <Badge>{run.steps.length} steps</Badge>
        </div>
        {run.steps.length
          ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
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
                      className="border-b border-zinc-100 dark:border-zinc-900"
                    >
                      <td className="py-3 pr-4 font-medium text-zinc-950 dark:text-zinc-50">
                        {step.name}
                        {step.error && (
                          <div className="mt-1 max-w-xl whitespace-pre-wrap text-xs font-normal text-red-600 dark:text-red-300">
                            {step.error}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={statusTone(step.status)}>
                          {statusIcon(step.status)}
                          {step.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-300">
                        {step.attempt}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-300">
                        {formatDuration(step.durationMs)}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-300">
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
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
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
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 text-left transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  key={artifact.key}
                  onClick={() => onPreviewArtifact(artifact)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-8 place-items-center rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                      {artifactIcon(artifact.contentType)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {artifact.label ?? artifact.key.split("/").pop()}
                      </div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {artifact.key}
                      </div>
                    </div>
                  </div>
                  <div className="hidden shrink-0 items-center gap-3 text-xs text-zinc-500 sm:flex">
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
    <div className="fixed inset-0 z-50 bg-zinc-950/50 p-4 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {artifact.label ?? artifact.key}
            </h3>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {artifact.contentType} · {artifact.key}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>关闭</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-zinc-50 p-4 dark:bg-zinc-900">
          {loading && <EmptyState>正在加载产物...</EmptyState>}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
          {!loading && !error && isImage && objectUrl && (
            <img
              className="mx-auto max-h-full max-w-full rounded-md border border-zinc-200 bg-white object-contain dark:border-zinc-800"
              src={objectUrl}
              alt={artifact.label ?? artifact.key}
            />
          )}
          {!loading && !error && isHtml && content && (
            <iframe
              className="h-full min-h-[70vh] w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
              srcDoc={content}
              title={artifact.label ?? artifact.key}
              sandbox=""
            />
          )}
          {!loading && !error && !isImage && !isHtml && (
            <pre className="min-h-[70vh] overflow-auto rounded-md border border-zinc-200 bg-white p-4 text-xs leading-5 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
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

function TriggerRunDialog(
  { open, onClose, onSubmit }: {
    open: boolean;
    onClose: () => void;
    onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  },
) {
  const [dryRun, setDryRun] = useState(true);
  const [maxArticles, setMaxArticles] = useState("10");
  const [sourceType, setSourceType] = useState("all");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;
  const canSubmit = dryRun || confirmed;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-zinc-950/50 p-4 backdrop-blur-sm">
      <form
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-950"
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
            });
            onClose();
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            触发微信文章工作流
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            建议先 dry-run 检查产物，再创建微信公众号草稿。
          </p>
        </div>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div>
              <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                Dry-run
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                不上传图片，不创建微信草稿，只生成可预览产物。
              </div>
            </div>
            <input
              className="size-4 accent-zinc-950"
              type="checkbox"
              checked={dryRun}
              onChange={(event) => {
                setDryRun(event.currentTarget.checked);
                setConfirmed(false);
              }}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-zinc-500">
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
              <span className="text-xs font-medium text-zinc-500">数据源</span>
              <Select
                value={sourceType}
                onChange={(event) => setSourceType(event.currentTarget.value)}
              >
                <option value="all">全部</option>
                <option value="firecrawl">网页</option>
                <option value="twitter">Twitter/X</option>
              </Select>
            </label>
          </div>
          {!dryRun && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                <AlertCircle className="size-4" />
                将创建微信公众号草稿
              </div>
              <label className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                <input
                  className="mt-1 size-4 accent-amber-700"
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
  const [runs, setRuns] = useState<ArticleRunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<ArticleRunDetail | null>(null);
  const [filter, setFilter] = useState<"all" | RunStatus>("all");
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<ArtifactRef | null>(
    null,
  );

  const saveApiKey = useCallback((nextApiKey: string) => {
    sessionStorage.setItem(API_KEY_STORAGE, nextApiKey);
    setApiKey(nextApiKey);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(API_KEY_STORAGE);
    setApiKey("");
    setHealth(null);
    setConfig(null);
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
      setHealth(healthData);
      setConfig(configData);
      await loadRuns();
      await loadSelectedRun(selectedRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [apiKey, loadRuns, loadSelectedRun, selectedRunId]);

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

  if (!apiKey) return <LoginView onLogin={saveApiKey} />;

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
              <Rocket className="size-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold">TrendPublish</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                微信文章 Workflow 控制台
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 text-sm text-zinc-500 sm:flex">
              <input
                className="size-4 accent-zinc-950"
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) =>
                  setAutoRefresh(event.currentTarget.checked)}
              />
              自动刷新
            </label>
            <Button onClick={refresh} disabled={loading}>
              <RefreshCw className={cx("size-4", loading && "animate-spin")} />
              刷新
            </Button>
            <Button variant="primary" onClick={() => setTriggerOpen(true)}>
              <Play className="size-4" />
              触发
            </Button>
            <Button variant="ghost" onClick={logout}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
        <Overview health={health} config={config} />
        <div className="grid gap-4 lg:grid-cols-[390px_1fr]">
          <div className="space-y-4">
            {latestRun && (
              <Card>
                <div className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  最近运行
                </div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-sm font-medium">
                    {latestRun.runId}
                  </div>
                  <Badge tone={statusTone(latestRun.status)}>
                    {statusIcon(latestRun.status)}
                    {latestRun.status}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(latestRun.updatedAt)}
                </div>
              </Card>
            )}
            <RunList
              runs={runs}
              selectedRunId={selectedRunId}
              onSelect={setSelectedRunId}
              filter={filter}
              setFilter={setFilter}
              query={query}
              setQuery={setQuery}
            />
          </div>
          <RunDetail run={selectedRun} onPreviewArtifact={setPreviewArtifact} />
        </div>
      </div>

      <TriggerRunDialog
        open={triggerOpen}
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
    <App />
  </React.StrictMode>,
);
