import {
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowStepContext,
  WorkflowStepOptions,
} from "@src/core/workflow/workflow-runtime.ts";
import {
  createWeixinArticleWorkflowDefinition,
  WEIXIN_ARTICLE_WORKFLOW_ID,
  WeixinArticleWorkflowInput,
} from "@src/app/weixin-article/workflow.definition.ts";
import cloudflareConfig from "../../../trendpublish.config.cloudflare.ts";
import {
  createConfigRuntime,
  getAppConfig,
  initializeAppConfig,
} from "@src/utils/config/app-config.ts";
import { createWeixinArticleDependencies } from "@src/app/weixin-article/create-weixin-article-dependencies.ts";
import { R2ArtifactStore } from "@src/platform/cloudflare/r2-artifact-store.ts";
import { KvArtifactStore } from "@src/platform/cloudflare/kv-artifact-store.ts";
import { KvD1RunStateStore } from "@src/platform/cloudflare/kv-d1-run-state-store.ts";
import { D1VectorStore } from "@src/platform/cloudflare/d1-vector-store.ts";
import { D1RuntimeConfigStore } from "@src/platform/cloudflare/d1-runtime-config-store.ts";
import { D1EditorialMemoryStore } from "@src/platform/cloudflare/d1-editorial-memory-store.ts";
import { renderDashboardHtml } from "@src/app/weixin-article/dashboard.html.ts";
import { createDashboardConfigSummary } from "@src/app/weixin-article/dashboard-summary.ts";
import { handleRuntimeConfigApi } from "@src/app/weixin-article/runtime/runtime-config-api.ts";
import { WeixinPublisher } from "@src/integrations/publish/providers/weixin-publisher.ts";
import { WeixinRelayPublisher } from "@src/integrations/publish/providers/weixin-relay-publisher.ts";
import { withLoggerContext } from "@src/core/logger/logger-context.ts";
import {
  resolveArticleRuntimeConfig,
  seedArticleRuntimeConfig,
} from "@src/app/weixin-article/runtime/article-runtime-config.service.ts";
import {
  type ArtifactObject,
  type ArtifactRef,
  type ArtifactStore,
  decodeJsonArtifact,
  decodeTextArtifact,
} from "@src/core/ports/artifact-store.ts";
import type {
  ContentPublisher,
  PublishResult,
} from "@src/core/ports/content-publisher.ts";
import type { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";
import type {
  CloudflareD1Database,
  CloudflareKvNamespace,
  CloudflareR2Bucket,
} from "@src/platform/cloudflare/cloudflare-bindings.ts";

interface CloudflareWorkflowStep {
  do<T>(
    name: string,
    optionsOrFn: WorkflowStepOptions | (() => Promise<T>),
    fn?: () => Promise<T>,
  ): Promise<T>;
  sleep?(name: string, duration: string | number): Promise<void>;
}

interface WorkflowBinding<TInput> {
  create(options?: { id?: string; params?: TInput }): Promise<unknown>;
}

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface CloudflareEnv {
  [key: string]: unknown;
  WEIXIN_ARTICLE_WORKFLOW: WorkflowBinding<WeixinArticleWorkflowInput>;
  ARTICLE_ARTIFACTS?: CloudflareR2Bucket;
  ARTICLE_RUNS: CloudflareKvNamespace;
  ARTICLE_DB: CloudflareD1Database;
  ASSETS?: AssetsBinding;
}

interface CloudflareWorkflowEvent<TInput> {
  payload?: TInput;
  timestamp?: Date;
  instanceId?: string;
}

type WorkflowEntrypointInstance = {
  env: CloudflareEnv;
};

type WorkflowEntrypointConstructor = new () => WorkflowEntrypointInstance;

const cloudflareWorkers = await import("cloudflare:workers") as {
  WorkflowEntrypoint: WorkflowEntrypointConstructor;
};
const CloudflareWorkflowEntrypoint = cloudflareWorkers.WorkflowEntrypoint;

function toStepContext(step: CloudflareWorkflowStep): WorkflowStepContext {
  return {
    do: (name, optionsOrFn, fn) => step.do(name, optionsOrFn, fn),
    sleep: async (name, duration) => {
      if (!step.sleep) {
        throw new Error("Cloudflare Workflow step.sleep is unavailable");
      }
      await step.sleep(name, duration);
    },
  };
}

function toWorkflowEvent(
  event: CloudflareWorkflowEvent<WeixinArticleWorkflowInput>,
): WorkflowEvent<WeixinArticleWorkflowInput> {
  return {
    payload: event.payload ?? {},
    id: event.instanceId ?? crypto.randomUUID(),
    timestamp: event.timestamp?.getTime() ?? Date.now(),
  };
}

export class WeixinArticleCloudflareWorkflow
  extends CloudflareWorkflowEntrypoint {
  private readonly definition: WorkflowDefinition<WeixinArticleWorkflowInput> =
    createWeixinArticleWorkflowDefinition({
      dependencyFactory: async (config, _event, runtimeConfig) => {
        return await createWeixinArticleDependencies(config, {
          artifactStore: createCloudflareArtifactStore(this.env),
          runStateStore: new KvD1RunStateStore(
            this.env.ARTICLE_RUNS,
            this.env.ARTICLE_DB,
          ),
          editorialMemoryStore: new D1EditorialMemoryStore(
            this.env.ARTICLE_DB,
          ),
          vectorStoreFactory: async () =>
            new D1VectorStore(this.env.ARTICLE_DB),
          mode: "cloudflare-workflow",
          profileId: runtimeConfig?.profile.id,
          runtimeConfigSnapshot: runtimeConfig?.snapshot,
        });
      },
      runtimeConfigStoreFactory: async () =>
        new D1RuntimeConfigStore(this.env.ARTICLE_DB),
    });

  async run(
    event: CloudflareWorkflowEvent<WeixinArticleWorkflowInput>,
    step: CloudflareWorkflowStep,
  ): Promise<void> {
    const workflowEvent = toWorkflowEvent(event);
    await withLoggerContext({
      runId: workflowEvent.payload.runId ?? workflowEvent.id,
      workflowId: WEIXIN_ARTICLE_WORKFLOW_ID,
      profileId: workflowEvent.payload.profileId,
      dryRun: workflowEvent.payload.dryRun,
      trigger: workflowEvent.payload.trigger,
      mode: "cloudflare-workflow",
    }, async () => {
      try {
        await initializeCloudflareConfig(this.env);
        await this.definition.run(workflowEvent, toStepContext(step));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[cloudflare-workflow] run failed", {
          runId: workflowEvent.payload.runId ?? workflowEvent.id,
          message,
          stack: error instanceof Error ? error.stack : undefined,
        });
        await markCloudflareRunFailed(this.env, workflowEvent, message);
        throw error;
      }
    });
  }
}

async function markCloudflareRunFailed(
  env: CloudflareEnv,
  event: WorkflowEvent<WeixinArticleWorkflowInput>,
  error: string,
): Promise<void> {
  const runId = event.payload.runId ?? event.id;
  const store = new KvD1RunStateStore(env.ARTICLE_RUNS, env.ARTICLE_DB);
  const existing = await store.getRun(runId);
  if (!existing) {
    await store.startRun({
      runId,
      mode: "cloudflare-workflow",
      dryRun: Boolean(event.payload.dryRun),
      trigger: event.payload.trigger ?? "manual",
    });
  }
  await store.failRun(runId, error);
}

async function initializeCloudflareConfig(env: CloudflareEnv): Promise<void> {
  await initializeAppConfig({
    source: cloudflareConfig,
    runtime: createConfigRuntime({
      target: "cloudflare",
      values: env,
    }),
  });
}

async function verifyCloudflareAuth(
  request: Request,
  env: CloudflareEnv,
): Promise<Response | null> {
  const expected = String(env.SERVER_API_KEY ?? "");
  const authHeader = request.headers.get("Authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1] ?? ""
    : "";
  if (
    !expected || !provided ||
    !await timingSafeEqual(provided, expected)
  ) {
    return Response.json({ error: "未授权的访问" }, { status: 401 });
  }
  return null;
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const leftDigest = await crypto.subtle.digest("SHA-256", left);
  const rightDigest = await crypto.subtle.digest("SHA-256", right);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let diff = left.byteLength === right.byteLength ? 0 : 1;
  for (let index = 0; index < leftBytes.length; index++) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

function createStores(env: CloudflareEnv) {
  return {
    artifactStore: createCloudflareArtifactStore(env),
    runStateStore: new KvD1RunStateStore(env.ARTICLE_RUNS, env.ARTICLE_DB),
    runtimeConfigStore: new D1RuntimeConfigStore(env.ARTICLE_DB),
    editorialMemoryStore: new D1EditorialMemoryStore(env.ARTICLE_DB),
  };
}

function createCloudflareArtifactStore(env: CloudflareEnv): ArtifactStore {
  return env.ARTICLE_ARTIFACTS
    ? new R2ArtifactStore(env.ARTICLE_ARTIFACTS)
    : new KvArtifactStore(env.ARTICLE_RUNS);
}

async function handleHealthRequest(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  const unauthorized = await verifyCloudflareAuth(request, env);
  if (unauthorized) return unauthorized;

  const checks: Record<string, { ok: boolean; detail: string }> = {};
  checks.bindings = {
    ok: Boolean(
      env.WEIXIN_ARTICLE_WORKFLOW && env.ARTICLE_RUNS && env.ARTICLE_DB &&
        (env.ARTICLE_ARTIFACTS || env.ARTICLE_RUNS),
    ),
    detail: env.ARTICLE_ARTIFACTS
      ? "Workflow/KV/D1/R2 bindings"
      : "Workflow/KV/D1 bindings, artifact fallback=KV",
  };

  try {
    await initializeCloudflareConfig(env);
    checks.config = { ok: true, detail: "trendpublish.config.cloudflare.ts" };
  } catch (error) {
    checks.config = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    await env.ARTICLE_RUNS.get("runs:latest");
    checks.kv = {
      ok: true,
      detail:
        "ARTICLE_RUNS readable; run history source=D1, KV cache writes are optional",
    };
  } catch (error) {
    checks.kv = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const row = await env.ARTICLE_DB.prepare("SELECT 1 AS ok")
      .first<{ ok: number }>();
    checks.d1 = {
      ok: row?.ok === 1,
      detail: "ARTICLE_DB SELECT 1",
    };
  } catch (error) {
    checks.d1 = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const store = createCloudflareArtifactStore(env);
    const key = `health/${crypto.randomUUID()}.txt`;
    await store.putText(key, "ok", {
      contentType: "text/plain; charset=utf-8",
      label: "health",
    });
    const value = await store.getText({
      store: env.ARTICLE_ARTIFACTS ? "r2" : "kv",
      key,
      contentType: "text/plain; charset=utf-8",
    });
    checks.artifacts = {
      ok: value === "ok",
      detail: env.ARTICLE_ARTIFACTS
        ? "ARTICLE_ARTIFACTS read/write"
        : "ARTICLE_RUNS artifact fallback read/write",
    };
  } catch (error) {
    checks.artifacts = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const ok = Object.values(checks).every((check) => check.ok);
  return Response.json({
    ok,
    mode: "cloudflare-workflow",
    timestamp: new Date().toISOString(),
    checks,
  }, { status: ok ? 200 : 500 });
}

async function handleConfigSummaryRequest(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  const unauthorized = await verifyCloudflareAuth(request, env);
  if (unauthorized) return unauthorized;

  await initializeCloudflareConfig(env);
  const config = await getAppConfig();
  const runtimeConfig = await resolveArticleRuntimeConfig(
    createStores(env).runtimeConfigStore,
    config,
  );
  return Response.json(
    createDashboardConfigSummary(
      runtimeConfig.config,
      "cloudflare-workflow",
    ),
  );
}

async function handleRunsRequest(
  request: Request,
  env: CloudflareEnv,
  pathname: string,
): Promise<Response> {
  const unauthorized = await verifyCloudflareAuth(request, env);
  if (unauthorized) return unauthorized;

  const stores = createStores(env);
  if (request.method === "POST" && pathname === "/api/runs") {
    const payload = await request.json().catch(
      () => ({}),
    ) as WeixinArticleWorkflowInput;
    const runId = payload.runId ?? `cf-${crypto.randomUUID()}`;
    await stores.runStateStore.startRun({
      runId,
      mode: "cloudflare-workflow",
      dryRun: Boolean(payload.dryRun),
      trigger: payload.trigger ?? "manual",
    });
    await stores.runStateStore.updateRun(runId, { status: "queued" });
    await env.WEIXIN_ARTICLE_WORKFLOW.create({
      id: `${WEIXIN_ARTICLE_WORKFLOW_ID}-${runId}`,
      params: {
        ...payload,
        runId,
        trigger: "manual",
      },
    });
    return Response.json({ success: true, runId });
  }

  if (request.method === "GET" && pathname === "/api/runs") {
    const runs = await stores.runStateStore.listRuns(50);
    return Response.json({ runs });
  }

  const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch) {
    const run = await stores.runStateStore.getRun(
      decodeURIComponent(runMatch[1]),
    );
    if (!run) {
      return Response.json({ error: "run 不存在" }, { status: 404 });
    }
    return Response.json({ run });
  }

  const publishMatch = pathname.match(/^\/api\/runs\/([^/]+)\/publish$/);
  if (request.method === "POST" && publishMatch) {
    return await handlePublishExistingRunRequest(
      request,
      env,
      decodeURIComponent(publishMatch[1]),
    );
  }

  const feedbackMatch = pathname.match(/^\/api\/runs\/([^/]+)\/feedback$/);
  if (feedbackMatch) {
    const runId = decodeURIComponent(feedbackMatch[1]);
    if (request.method === "GET") {
      const feedback = await stores.editorialMemoryStore.getFeedback(runId);
      return Response.json({ feedback });
    }
    if (request.method === "PUT") {
      const payload = await request.json().catch(() => ({})) as {
        rating?: string;
        note?: string;
        profileId?: string;
      };
      const rating = normalizeFeedbackRating(payload.rating);
      if (!rating) {
        return Response.json(
          { error: "rating 必须是 good / ok / bad" },
          { status: 400 },
        );
      }
      const feedback = await stores.editorialMemoryStore.saveFeedback({
        runId,
        profileId: typeof payload.profileId === "string"
          ? payload.profileId
          : undefined,
        rating,
        note: typeof payload.note === "string" ? payload.note : undefined,
      });
      return Response.json({ feedback });
    }
    if (request.method === "DELETE") {
      const deleted = await stores.editorialMemoryStore.deleteFeedback(runId);
      return Response.json({ deleted });
    }
  }

  return Response.json({ error: "无效的 runs API" }, { status: 404 });
}

async function handlePublishExistingRunRequest(
  request: Request,
  env: CloudflareEnv,
  runId: string,
): Promise<Response> {
  const payload = await request.json().catch(() => ({})) as {
    forcePublish?: boolean;
  };
  if (!payload.forcePublish) {
    return Response.json(
      { error: "真实发布需要 forcePublish=true" },
      { status: 400 },
    );
  }

  await initializeCloudflareConfig(env);
  const stores = createStores(env);
  const run = await stores.runStateStore.getRun(runId);
  if (!run) {
    return Response.json({ error: "run 不存在" }, { status: 404 });
  }
  if (run.dryRun) {
    return Response.json(
      { error: "dry-run 产物不能直接发布，请重新生成真实发布 run" },
      { status: 400 },
    );
  }

  const artifactStore = stores.artifactStore;
  const publishKey = artifactStore.createRunKey(
    runId,
    "20-publish-result",
    "json",
  );
  const existingPublish = await artifactStore.getObject(publishKey);
  if (existingPublish) {
    return Response.json({
      success: true,
      reused: true,
      result: decodeJsonArtifact<PublishResult>(existingPublish.body),
      artifact: existingPublish.ref,
    });
  }

  const config = await getAppConfig();
  const publisher = createCloudflarePublisher(config);
  const titleObject = await getFirstArtifactObject(artifactStore, runId, [
    "18-final-title.json",
    "10-title.json",
  ]);
  const htmlObject = await getFirstArtifactObject(artifactStore, runId, [
    "19-final-article.html",
    "16-revised-article-round-1.html",
    "12-rendered-article.html",
  ]);
  const coverObject = await getFirstArtifactObject(artifactStore, runId, [
    "11-cover.json",
  ]);

  await stores.runStateStore.startStep(runId, "publish-existing-run", {
    inputArtifacts: [titleObject.ref, htmlObject.ref, coverObject.ref],
  });
  try {
    const titleSnapshot = decodeJsonArtifact<{ title?: string }>(
      titleObject.body,
    );
    const coverSnapshot = decodeJsonArtifact<{ mediaId?: string }>(
      coverObject.body,
    );
    const title = titleSnapshot.title?.trim();
    const coverMediaId = coverSnapshot.mediaId?.trim();
    if (!title) {
      throw new Error("发布产物缺少标题");
    }
    if (!coverMediaId) {
      throw new Error("发布产物缺少封面 mediaId");
    }

    const result = await publisher.publishArticle({
      content: decodeTextArtifact(htmlObject.body),
      title,
      digest: title,
      coverMediaId,
    });
    const publishRef = await artifactStore.putJson(publishKey, result, {
      label: "发布结果",
      contentType: "application/json",
    });
    await stores.runStateStore.finishStep(runId, "publish-existing-run", {
      outputArtifacts: [publishRef],
    });
    await stores.runStateStore.finishRun(runId, {
      summary: [
        run.summary ?? "Cloudflare 文章生成完成",
        `补发布: ${result.status}${result.url ? ` (${result.url})` : ""}`,
      ].join("\n"),
      artifacts: mergeArtifactRefs(run.artifacts, publishRef),
    });
    return Response.json({ success: true, result, artifact: publishRef });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await stores.runStateStore.failStep(
      runId,
      "publish-existing-run",
      message,
    ).catch(() => {});
    await stores.runStateStore.failRun(runId, message).catch(() => {});
    return Response.json({ error: message }, { status: 500 });
  }
}

function createCloudflarePublisher(
  config: ResolvedTrendPublishConfig,
): ContentPublisher {
  switch (config.features.article.publisher.provider) {
    case "weixin":
      return new WeixinPublisher(config.providers.publish.weixin);
    case "weixin-relay":
      return new WeixinRelayPublisher(config.providers.publish.weixinRelay);
  }
}

async function getFirstArtifactObject(
  artifactStore: ArtifactStore,
  runId: string,
  candidates: string[],
): Promise<ArtifactObject> {
  for (const candidate of candidates) {
    const [name, extension] = splitArtifactCandidate(candidate);
    const object = await artifactStore.getObject(
      artifactStore.createRunKey(runId, name, extension),
    );
    if (object) {
      return object;
    }
  }
  throw new Error(`run ${runId} 缺少 artifact: ${candidates.join(" / ")}`);
}

function splitArtifactCandidate(candidate: string): [string, string] {
  const index = candidate.lastIndexOf(".");
  if (index <= 0 || index === candidate.length - 1) {
    throw new Error(`非法 artifact 候选: ${candidate}`);
  }
  return [candidate.slice(0, index), candidate.slice(index + 1)];
}

function mergeArtifactRefs(
  artifacts: ArtifactRef[],
  next: ArtifactRef,
): ArtifactRef[] {
  const seen = new Set<string>();
  const merged: ArtifactRef[] = [];
  for (const artifact of [...artifacts, next]) {
    if (seen.has(artifact.key)) continue;
    seen.add(artifact.key);
    merged.push(artifact);
  }
  return merged;
}

function normalizeFeedbackRating(
  value: string | undefined,
): "good" | "ok" | "bad" | null {
  return value === "good" || value === "ok" || value === "bad" ? value : null;
}

async function handleArtifactRequest(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  const unauthorized = await verifyCloudflareAuth(request, env);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return Response.json({ error: "缺少 key 参数" }, { status: 400 });
  }
  const object = await createStores(env).artifactStore.getObject(key);
  if (!object) {
    return Response.json({ error: "artifact 不存在" }, { status: 404 });
  }
  return new Response(
    toArrayBuffer(object.body),
    {
      headers: {
        "Content-Type": object.ref.contentType,
        "Cache-Control": "no-store",
      },
    },
  );
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

async function handleDashboardRequest(
  request: Request,
  env: CloudflareEnv,
): Promise<Response> {
  if (!env.ASSETS) {
    return new Response(renderDashboardHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const assetRequest = rewriteDashboardAssetRequest(request);
  const response = await env.ASSETS.fetch(assetRequest);
  if (response.status !== 404) return response;

  const url = new URL(request.url);
  if (!url.pathname.startsWith("/dashboard/assets/")) {
    const indexRequest = rewriteDashboardAssetRequest(request, "/index.html");
    return await env.ASSETS.fetch(indexRequest);
  }
  return response;
}

function rewriteDashboardAssetRequest(
  request: Request,
  forcedPath?: string,
): Request {
  const url = new URL(request.url);
  if (forcedPath) {
    url.pathname = forcedPath;
  } else if (url.pathname === "/dashboard" || url.pathname === "/dashboard/") {
    url.pathname = "/index.html";
  } else {
    url.pathname = url.pathname.replace(/^\/dashboard/, "") || "/index.html";
  }
  return new Request(url.toString(), {
    headers: request.headers,
    method: request.method,
  });
}

function isDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && isDashboardPath(url.pathname)) {
      return await handleDashboardRequest(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      return await handleHealthRequest(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/config/summary") {
      return await handleConfigSummaryRequest(request, env);
    }
    if (
      url.pathname === "/api/config/providers" ||
      url.pathname.startsWith("/api/config/capabilities") ||
      url.pathname.startsWith("/api/config/features/article/profiles")
    ) {
      const unauthorized = await verifyCloudflareAuth(request, env);
      if (unauthorized) return unauthorized;
      await initializeCloudflareConfig(env);
      const response = await handleRuntimeConfigApi(
        request,
        url.pathname,
        createStores(env).runtimeConfigStore,
        await getAppConfig(),
      );
      if (response) return response;
    }
    if (
      url.pathname === "/api/runs" || url.pathname.startsWith("/api/runs/")
    ) {
      return await handleRunsRequest(request, env, url.pathname);
    }
    if (url.pathname === "/api/artifacts") {
      return await handleArtifactRequest(request, env);
    }
    if (request.method !== "POST" || url.pathname !== "/api/workflow") {
      return new Response("Not Found", { status: 404 });
    }

    const unauthorized = await verifyCloudflareAuth(request, env);
    if (unauthorized) return unauthorized;

    const payload = await request.json().catch(
      () => ({}),
    ) as WeixinArticleWorkflowInput;
    const runId = payload.runId ?? `cf-${crypto.randomUUID()}`;
    await env.WEIXIN_ARTICLE_WORKFLOW.create({
      id: `${WEIXIN_ARTICLE_WORKFLOW_ID}-${runId}`,
      params: {
        ...payload,
        runId,
        trigger: "manual",
      },
    });
    return Response.json({ success: true, runId });
  },

  async scheduled(
    _event: unknown,
    env: CloudflareEnv,
  ): Promise<void> {
    await initializeCloudflareConfig(env);
    const config = await getAppConfig();
    const runtimeConfigStore = new D1RuntimeConfigStore(env.ARTICLE_DB);
    await seedArticleRuntimeConfig(runtimeConfigStore, config);
    const dueSchedules = await runtimeConfigStore.listDueSchedules(new Date());
    for (const due of dueSchedules) {
      if (
        !await runtimeConfigStore.markScheduleTriggered(
          due.schedule.id,
          due.slot,
        )
      ) {
        continue;
      }
      const runId = `cf-cron-${crypto.randomUUID()}`;
      await env.WEIXIN_ARTICLE_WORKFLOW.create({
        id: `${WEIXIN_ARTICLE_WORKFLOW_ID}-${runId}`,
        params: {
          dryRun: due.schedule.dryRun,
          runId,
          trigger: "cron",
          profileId: due.schedule.profileId,
        },
      });
    }
  },
};
