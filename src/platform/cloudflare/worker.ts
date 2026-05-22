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
  initializeAppConfig,
} from "@src/utils/config/app-config.ts";
import { createWeixinArticleDependencies } from "@src/app/weixin-article/create-weixin-article-dependencies.ts";
import { R2ArtifactStore } from "@src/platform/cloudflare/r2-artifact-store.ts";
import { KvArtifactStore } from "@src/platform/cloudflare/kv-artifact-store.ts";
import { KvD1RunStateStore } from "@src/platform/cloudflare/kv-d1-run-state-store.ts";
import { D1VectorStore } from "@src/platform/cloudflare/d1-vector-store.ts";
import { renderDashboardHtml } from "@src/app/weixin-article/dashboard.html.ts";
import type { ArtifactStore } from "@src/core/ports/artifact-store.ts";
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

interface CloudflareEnv {
  [key: string]: unknown;
  WEIXIN_ARTICLE_WORKFLOW: WorkflowBinding<WeixinArticleWorkflowInput>;
  ARTICLE_ARTIFACTS?: CloudflareR2Bucket;
  ARTICLE_RUNS: CloudflareKvNamespace;
  ARTICLE_DB: CloudflareD1Database;
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
    createWeixinArticleWorkflowDefinition(
      async (config) => {
        return await createWeixinArticleDependencies(config, {
          artifactStore: createCloudflareArtifactStore(this.env),
          runStateStore: new KvD1RunStateStore(
            this.env.ARTICLE_RUNS,
            this.env.ARTICLE_DB,
          ),
          vectorStoreFactory: async () =>
            new D1VectorStore(this.env.ARTICLE_DB),
          mode: "cloudflare-workflow",
        });
      },
    );

  async run(
    event: CloudflareWorkflowEvent<WeixinArticleWorkflowInput>,
    step: CloudflareWorkflowStep,
  ): Promise<void> {
    const workflowEvent = toWorkflowEvent(event);
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
    const key = `health:${crypto.randomUUID()}`;
    await env.ARTICLE_RUNS.put(key, "ok", { expirationTtl: 60 });
    const value = await env.ARTICLE_RUNS.get(key);
    await env.ARTICLE_RUNS.delete(key);
    checks.kv = {
      ok: value === "ok",
      detail: "ARTICLE_RUNS read/write/delete",
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

  return Response.json({ error: "无效的 runs API" }, { status: 404 });
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

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/dashboard") {
      return new Response(renderDashboardHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      return await handleHealthRequest(request, env);
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
    const runId = `cf-cron-${crypto.randomUUID()}`;
    await env.WEIXIN_ARTICLE_WORKFLOW.create({
      id: `${WEIXIN_ARTICLE_WORKFLOW_ID}-${runId}`,
      params: { dryRun: false, runId, trigger: "cron" },
    });
  },
};
