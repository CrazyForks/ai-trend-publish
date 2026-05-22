import { triggerWorkflow } from "./controllers/workflow.controller.ts";
import { WorkflowType } from "./controllers/cron.ts";
import { getAppConfig } from "@src/utils/config/app-config.ts";
import { renderDashboardHtml } from "@src/app/weixin-article/dashboard.html.ts";
import { createLocalArticleRuntimeStores } from "@src/app/weixin-article/local-runtime-stores.ts";
import { LocalWorkflowRuntime } from "@src/core/workflow/local-workflow-runtime.ts";
import { createLocalWeixinArticleWorkflowDefinition } from "@src/app/weixin-article/local-workflow.definition.ts";

export interface JSONRPCRequest {
  jsonrpc: string;
  method: string;
  params: Record<string, any>;
  id: string | number;
}

export interface JSONRPCResponse {
  jsonrpc: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}

export class JSONRPCServer {
  private routes: Record<string, (params: Record<string, any>) => Promise<any>>;

  constructor() {
    this.routes = {};
  }

  registerRoute(
    method: string,
    handler: (params: Record<string, any>) => Promise<any>,
  ) {
    this.routes[method] = handler;
  }

  async handleRequest(request: Request): Promise<Response> {
    try {
      if (request.method !== "POST") {
        throw new Error("只支持 POST 请求");
      }

      const body = await request.json() as JSONRPCRequest;

      if (!body.jsonrpc || body.jsonrpc !== "2.0") {
        throw new Error("无效的 JSON-RPC 请求");
      }

      if (!body.method) {
        throw new Error("请求缺少方法名");
      }

      const handler = this.routes[body.method];
      if (!handler) {
        throw new Error(`方法 ${body.method} 不存在`);
      }

      const result = await handler(body.params || {});

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          result,
          id: body.id,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      const isClientError = error instanceof Error && (
        error.message.includes("无效的") ||
        error.message.includes("不存在") ||
        error.message.includes("缺少")
      );

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: isClientError ? -32600 : -32603,
            message: isClientError ? error.message : "内部服务器错误",
            data: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          id: "unknown",
        }),
        {
          status: isClientError ? 400 : 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
  }
}

// 创建 JSON-RPC 服务器实例
const rpcServer = new JSONRPCServer();
rpcServer.registerRoute("triggerWorkflow", triggerWorkflow);

async function verifyRequestAuth(req: Request): Promise<Response | null> {
  const API_KEY = (await getAppConfig()).server.apiKey;
  const authHeader = req.headers.get("Authorization");
  if (
    !authHeader || !authHeader.startsWith("Bearer ") ||
    authHeader.split(" ")[1] !== API_KEY
  ) {
    return jsonResponse({
      error: {
        code: -32001,
        message: "未授权的访问",
        data: {
          error: "缺少有效的 Authorization 请求头",
        },
      },
    }, 401);
  }
  return null;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRunsRequest(req: Request, pathname: string) {
  const unauthorized = await verifyRequestAuth(req);
  if (unauthorized) return unauthorized;

  const config = await getAppConfig();
  const stores = createLocalArticleRuntimeStores(config);

  if (req.method === "POST" && pathname === "/api/runs") {
    const payload = await req.json().catch(() => ({})) as Record<string, any>;
    const runId = payload.runId ?? `manual-${crypto.randomUUID()}`;
    const runtime = new LocalWorkflowRuntime();
    await runtime.run(createLocalWeixinArticleWorkflowDefinition(), {
      payload: {
        ...payload,
        runId,
        trigger: "manual",
      },
      id: runId,
      timestamp: Date.now(),
    });
    return jsonResponse({ success: true, runId });
  }

  if (req.method === "GET" && pathname === "/api/runs") {
    const runs = await stores.runStateStore.listRuns(50);
    return jsonResponse({ runs });
  }

  const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (req.method === "GET" && runMatch) {
    const run = await stores.runStateStore.getRun(
      decodeURIComponent(runMatch[1]),
    );
    if (!run) {
      return jsonResponse({ error: "run 不存在" }, 404);
    }
    return jsonResponse({ run });
  }

  return jsonResponse({ error: "无效的 runs API" }, 404);
}

async function handleArtifactRequest(req: Request): Promise<Response> {
  const unauthorized = await verifyRequestAuth(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return jsonResponse({ error: "缺少 key 参数" }, 400);
  }
  const config = await getAppConfig();
  const stores = createLocalArticleRuntimeStores(config);
  const object = await stores.artifactStore.getObject(key);
  if (!object) {
    return jsonResponse({ error: "artifact 不存在" }, 404);
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

// 请求处理器
const handler = async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/dashboard") {
      return new Response(renderDashboardHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (url.pathname === "/api/runs" || url.pathname.startsWith("/api/runs/")) {
      return await handleRunsRequest(req, url.pathname);
    }
    if (url.pathname === "/api/artifacts") {
      return await handleArtifactRequest(req);
    }

    // 验证 Authorization 请求头
    const unauthorized = await verifyRequestAuth(req);
    if (unauthorized) {
      const body = await unauthorized.json();
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: body.error,
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // 规范化路径（移除开头和结尾的斜杠，处理可能的错误格式）
    const normalizedPath = url.pathname.replace(/^\/+|\/+$/g, "");

    // 只处理 api/workflow 路径的请求
    if (normalizedPath === "api/workflow") {
      return await rpcServer.handleRequest(req);
    }

    // 处理其他请求
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32601,
          message: "无效的API路径",
          data: {
            path: normalizedPath,
            expectedPath: "api/workflow",
          },
        },
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("请求处理错误:", error);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "服务器内部错误",
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
};

export default function startServer(port = 8000) {
  Deno.serve({ port }, handler);
  console.log(`JSON-RPC 服务器运行在 http://localhost:${port}`);
  console.log("支持的方法:");
  console.log("- triggerWorkflow");
  console.log(`默认工作流: ${WorkflowType.WeixinArticle}`);
}
