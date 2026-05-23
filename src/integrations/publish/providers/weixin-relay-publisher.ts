import {
  ContentImageUploader,
  ContentPublisher,
  PublishArticleRequest,
  PublishResult,
} from "@src/core/ports/content-publisher.ts";
import type { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";
import { ProviderError } from "@src/core/errors/provider-error.ts";
import { redactSensitiveText } from "@src/utils/security/redact.ts";
import { HttpClient, HttpError } from "@src/utils/http/http-client.ts";

type WeixinRelayConfig = ResolvedTrendPublishConfig["providers"]["publish"][
  "weixinRelay"
];

interface RelayResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

export class WeixinRelayPublisher
  implements ContentPublisher, ContentImageUploader {
  constructor(
    private readonly config: WeixinRelayConfig,
    private readonly httpClient = HttpClient.getInstance(),
  ) {}

  async validateIpWhitelist(): Promise<string | boolean> {
    const result = await this.request<{ result: string | boolean }>(
      "/api/weixin/validate-ip",
      {},
    );
    return result.result;
  }

  async uploadImage(imageUrl: string): Promise<string> {
    const result = await this.request<{ mediaId: string }>(
      "/api/weixin/upload-image",
      { imageUrl },
    );
    return result.mediaId;
  }

  async uploadContentImage(
    imageUrl: string,
    imageBuffer?: ArrayBuffer | Uint8Array,
  ): Promise<string> {
    const result = await this.request<{ url: string }>(
      "/api/weixin/upload-content-image",
      {
        imageUrl,
        imageBufferBase64: imageBuffer ? bytesToBase64(imageBuffer) : undefined,
      },
    );
    return result.url;
  }

  async publishArticle(request: PublishArticleRequest): Promise<PublishResult> {
    const result = await this.request<PublishResult>(
      "/api/weixin/publish",
      request,
    );
    return {
      ...result,
      publishedAt: new Date(result.publishedAt),
    };
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const baseUrl = this.config.url.replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("providers.publish.weixinRelay.url is not configured");
    }
    if (!this.config.token) {
      throw new Error("providers.publish.weixinRelay.token is not configured");
    }

    let json: RelayResponse<T>;
    try {
      json = await this.httpClient.request<RelayResponse<T>>(
        `${baseUrl}${path}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.config.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          retries: 1,
          timeout: 30000,
        },
      );
    } catch (error) {
      const statusCode = error instanceof HttpError
        ? error.statusCode
        : undefined;
      throw new ProviderError({
        provider: "weixin-relay",
        kind: statusCode === 401 || statusCode === 403
          ? "auth"
          : "invalid_response",
        statusCode,
        message: redactSensitiveText(
          error instanceof Error ? error.message : String(error),
        ),
      });
    }
    if (!json.success) {
      throw new ProviderError({
        provider: "weixin-relay",
        kind: "invalid_response",
        message: redactSensitiveText(
          json.error ?? "Weixin relay request failed",
        ),
      });
    }
    if (json.data === undefined) {
      throw new ProviderError({
        provider: "weixin-relay",
        kind: "empty_content",
        message: "Weixin relay response is missing data",
      });
    }
    return json.data;
  }
}

function bytesToBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
