import {
  initializeAppConfig,
  parseConfigArgs,
} from "@src/utils/config/app-config.ts";
import { WeixinPublisher } from "@src/integrations/publish/providers/weixin-publisher.ts";
import type { PublishArticleRequest } from "@src/core/ports/content-publisher.ts";
import { Logger } from "@zilla/logger";

const logger = new Logger("weixin-relay");
const { configPath } = parseConfigArgs(Deno.args);
const config = await initializeAppConfig({ configPath });
assertRelayConfig(config);
const publisher = new WeixinPublisher(config.providers.publish.weixin);
const port = Number(Deno.env.get("PORT") ?? config.server.port ?? 8080);

logger.info(`Weixin relay listening on http://0.0.0.0:${port}`);

Deno.serve({ port }, async (request) => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({
      ok: true,
      service: "weixin-relay",
      timestamp: new Date().toISOString(),
    });
  }

  const unauthorized = await verifyAuth(request);
  if (unauthorized) return unauthorized;

  try {
    if (
      request.method === "POST" && url.pathname === "/api/weixin/validate-ip"
    ) {
      const result = await publisher.validateIpWhitelist();
      return ok({ result });
    }

    if (
      request.method === "POST" && url.pathname === "/api/weixin/upload-image"
    ) {
      const body = await readJson<{ imageUrl?: string }>(request);
      const mediaId = await publisher.uploadImage(body.imageUrl ?? "");
      return ok({ mediaId });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/weixin/upload-content-image"
    ) {
      const body = await readJson<{
        imageUrl?: string;
        imageBufferBase64?: string;
      }>(request);
      const imageUrl = body.imageUrl ?? "";
      const imageBuffer = body.imageBufferBase64
        ? base64ToBytes(body.imageBufferBase64)
        : undefined;
      const uploadedUrl = await publisher.uploadContentImage(
        imageUrl,
        imageBuffer,
      );
      return ok({ url: uploadedUrl });
    }

    if (request.method === "POST" && url.pathname === "/api/weixin/publish") {
      const body = await readJson<PublishArticleRequest>(request);
      const result = await publisher.publishArticle(body);
      return ok(result);
    }

    return json({ success: false, error: "Not Found" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Relay request failed:", message);
    return json({ success: false, error: message }, { status: 500 });
  }
});

async function verifyAuth(request: Request): Promise<Response | null> {
  const expected = config.server.apiKey;
  const authHeader = request.headers.get("Authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!expected || !provided || !await timingSafeEqual(provided, expected)) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const leftDigest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", left),
  );
  const rightDigest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", right),
  );
  let diff = left.byteLength === right.byteLength ? 0 : 1;
  for (let index = 0; index < leftDigest.length; index++) {
    diff |= leftDigest[index] ^ rightDigest[index];
  }
  return diff === 0;
}

async function readJson<T>(request: Request): Promise<T> {
  return await request.json() as T;
}

function ok<T>(data: T): Response {
  return json({ success: true, data });
}

function json(value: unknown, init: ResponseInit = {}): Response {
  return Response.json(value, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function assertRelayConfig(config: {
  server: { apiKey: string };
  providers: {
    publish: {
      weixin: { appId: string; appSecret: string };
    };
  };
}): void {
  assertConfigured("server.apiKey", config.server.apiKey);
  assertConfigured(
    "providers.publish.weixin.appId",
    config.providers.publish.weixin.appId,
  );
  assertConfigured(
    "providers.publish.weixin.appSecret",
    config.providers.publish.weixin.appSecret,
  );
}

function assertConfigured(name: string, value: string): void {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.includes("change-me") ||
    normalized.includes("your-") ||
    normalized.includes("your_")
  ) {
    throw new Error(`weixin-relay 配置未填写: ${name}`);
  }
}
