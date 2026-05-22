import {
  ContentImageUploader,
  ContentPublisher,
  PublishArticleRequest,
  PublishResult,
} from "@src/core/ports/content-publisher.ts";
import type { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";

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
  constructor(private readonly config: WeixinRelayConfig) {}

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

    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const json = parseRelayResponse<T>(text);
    if (!response.ok || !json.success) {
      throw new Error(
        json.error ?? `Weixin relay request failed: HTTP ${response.status}`,
      );
    }
    if (json.data === undefined) {
      throw new Error("Weixin relay response is missing data");
    }
    return json.data;
  }
}

function parseRelayResponse<T>(text: string): RelayResponse<T> {
  try {
    return text ? JSON.parse(text) as RelayResponse<T> : {};
  } catch {
    return { error: `Weixin relay returned non-JSON response: ${text}` };
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
