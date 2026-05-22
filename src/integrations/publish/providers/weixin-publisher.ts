import {
  ContentImageUploader,
  ContentPublisher,
  PublishArticleRequest,
  PublishResult,
} from "@src/core/ports/content-publisher.ts";
import type { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";
import { Logger } from "@zilla/logger";
const logger = new Logger("weixin-publisher");

interface WeixinToken {
  access_token: string;
  expires_in: number;
  expiresAt: Date;
}

interface WeixinDraft {
  media_id: string;
  article_id?: string;
}

function toArrayBuffer(imageBuffer: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (imageBuffer instanceof ArrayBuffer) {
    return imageBuffer;
  }

  const buffer = new ArrayBuffer(imageBuffer.byteLength);
  new Uint8Array(buffer).set(imageBuffer);
  return buffer;
}

export class WeixinPublisher implements ContentPublisher, ContentImageUploader {
  private accessToken: WeixinToken | null = null;
  private appId: string | undefined;
  private appSecret: string | undefined;

  constructor(
    private readonly configuredProvider?: ResolvedTrendPublishConfig[
      "providers"
    ]["publish"]["weixin"],
  ) {}

  async refresh(): Promise<void> {
    const provider = this.getProvider();
    this.appId = provider.appId;
    this.appSecret = provider.appSecret;
    logger.debug("微信公众号配置:", {
      appId: maskSecret(this.appId),
      appSecret: maskSecret(this.appSecret),
    });
  }

  private async ensureAccessToken(): Promise<string> {
    // 检查现有token是否有效
    if (
      this.accessToken &&
      this.accessToken.expiresAt > new Date(Date.now() + 60000) // 预留1分钟余量
    ) {
      return this.accessToken.access_token;
    }

    try {
      await this.refresh();
      // 获取新token
      const url =
        `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;
      const response = await fetch(url).then((res) => res.json());
      const { access_token, expires_in } = response;

      if (!access_token) {
        throw new Error(
          "获取access_token失败: " + JSON.stringify(response),
        );
      }

      this.accessToken = {
        access_token,
        expires_in,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      };

      return access_token;
    } catch (error) {
      logger.error("获取微信access_token失败:", error);
      throw error;
    }
  }

  private async uploadDraft(
    article: string,
    title: string,
    digest: string,
    mediaId: string,
  ): Promise<WeixinDraft> {
    const token = await this.ensureAccessToken();
    const url =
      `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;

    const provider = this.getProvider();
    const articles = [
      {
        title: title,
        author: provider.author,
        digest: digest,
        content: article,
        thumb_media_id: mediaId,
        need_open_comment: provider.needOpenComment ? 1 : 0,
        only_fans_can_comment: provider.onlyFansCanComment ? 1 : 0,
      },
    ];
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          articles,
        }),
      }).then((res) => res.json());

      if (response.errcode) {
        throw new Error(`上传草稿失败: ${response.errmsg}`);
      }

      return {
        media_id: response.media_id,
      };
    } catch (error) {
      logger.error("上传微信草稿失败:", error);
      throw error;
    }
  }
  /**
   * 上传图片到微信
   * @param imageUrl 图片URL
   * @returns 图片ID
   */
  async uploadImage(imageUrl: string): Promise<string> {
    if (!imageUrl) {
      // 如果图片URL为空，则返回一个默认的图片ID
      return "SwCSRjrdGJNaWioRQUHzgF68BHFkSlb_f5xlTquvsOSA6Yy0ZRjFo0aW9eS3JJu_";
    }
    const imageBuffer = await fetch(imageUrl).then((res) => res.arrayBuffer());

    const token = await this.ensureAccessToken();
    const url =
      `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`;

    try {
      // 创建FormData并添加图片数据
      const formData = new FormData();
      formData.append(
        "media",
        new Blob([imageBuffer], { type: "image/jpeg" }),
        `image_${Math.random().toString(36).substring(2, 8)}.jpg`,
      );

      const response = await fetch(url, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "*/*",
        },
      }).then((res) => res.json());

      if (response.errcode) {
        throw new Error(`上传图片失败: ${response.errmsg}`);
      }

      return response.media_id;
    } catch (error) {
      logger.error("上传微信图片失败:", error);
      throw error;
    }
  }

  /**
   * 上传图文消息内的图片获取URL
   * @param imageUrl 图片URL
   * @returns 图片URL
   * @description 本接口所上传的图片不占用公众号的素材库中图片数量的限制
   * 图片仅支持jpg/png格式，大小必须在1MB以下
   */
  async uploadContentImage(
    imageUrl: string,
    imageBuffer?: ArrayBuffer | Uint8Array,
  ): Promise<string> {
    if (!imageUrl) {
      throw new Error("图片URL不能为空");
    }

    const token = await this.ensureAccessToken();
    const url =
      `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`;

    try {
      // 创建FormData并添加图片数据
      const formData = new FormData();

      if (imageBuffer) {
        // 如果提供了压缩后的图片buffer，直接使用
        formData.append(
          "media",
          new Blob([toArrayBuffer(imageBuffer)], { type: "image/jpeg" }),
          `image_${Math.random().toString(36).substring(2, 8)}.jpg`,
        );
      } else {
        // 否则下载原图
        const buffer = await fetch(imageUrl).then((res) => res.arrayBuffer());
        formData.append(
          "media",
          new Blob([buffer], { type: "image/jpeg" }),
          `image_${Math.random().toString(36).substring(2, 8)}.jpg`,
        );
      }

      const response = await fetch(url, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "*/*",
        },
      }).then((res) => res.json());

      if (response.errcode) {
        throw new Error(`上传图文消息图片失败: ${response.errmsg}`);
      }

      return response.url;
    } catch (error) {
      logger.error("上传微信图文消息图片失败:", error);
      throw error;
    }
  }

  /**
   * 发布文章到微信
   * @param article 文章内容
   * @param title 文章标题
   * @param digest 文章摘要
   * @param mediaId 图片ID
   * @returns 发布结果
   */
  async publishArticle(request: PublishArticleRequest): Promise<PublishResult> {
    try {
      // 上传草稿
      const draft = await this.uploadDraft(
        request.content,
        request.title,
        request.digest,
        request.coverMediaId,
      );
      return {
        publishId: draft.media_id,
        status: "draft",
        publishedAt: new Date(),
        platform: "weixin",
        url: `https://mp.weixin.qq.com/s/${draft.media_id}`,
      };
    } catch (error) {
      logger.error("微信发布失败:", error);
      throw error;
    }
  }

  /**
   * 验证当前服务器IP是否在微信公众号的IP白名单中
   * @returns 返回验证结果，true表示IP在白名单中，false表示不在
   * @throws 当API调用失败时抛出错误（非IP白名单相关的错误）
   */
  async validateIpWhitelist(): Promise<string | boolean> {
    try {
      await this.ensureAccessToken();
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("40164")) {
        return error.message.match(/invalid ip ([^ ]+)/)?.[1] ?? "未知IP";
      }
      throw error;
    }
  }

  private getProvider(): ResolvedTrendPublishConfig["providers"]["publish"][
    "weixin"
  ] {
    if (!this.configuredProvider) {
      throw new Error("providers.publish.weixin is not configured");
    }
    return this.configuredProvider;
  }
}

function maskSecret(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
