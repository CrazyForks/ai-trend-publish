import { useEffect, useMemo, useState } from "react";
import { FileJson } from "lucide-react";
import { apiArtifact } from "../api/client.ts";
import type {
  ArticlePlan,
  ArticleQualityReview,
  ArticleRunDetail,
  ArtifactRef,
  EditorialDecision,
  EditorialTopicReport,
  PublishArtifactResult,
  TopicRecommendation,
} from "../api/types.ts";
import { ArticleQualityShell } from "../components/article-quality-shell.tsx";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MetricChip,
} from "../components/ui.tsx";

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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

export function ArticleQualityWorkspace(
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
