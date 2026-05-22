// src/utils/image/image-processor.ts
import { ContentImageUploader } from "@src/core/ports/content-publisher.ts";

interface ImageValidationResult {
  isValid: boolean;
  contentType?: string;
  error?: string;
}

interface ImageDownloadResult extends ImageValidationResult {
  imageBuffer?: ArrayBuffer;
}

interface ImageProcessResult {
  originalUrl: string;
  newUrl?: string;
  error?: string;
}

interface ExtractedImageUrl {
  originalUrl: string;
  fetchUrl: string;
}

export class WeixinImageProcessor {
  private static readonly MAX_IMAGE_SIZE = 1024 * 1024; // 1MB
  private static readonly VALID_IMAGE_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
  ];

  private imageUploader: ContentImageUploader;

  constructor(imageUploader: ContentImageUploader) {
    this.imageUploader = imageUploader;
  }

  /**
   * 压缩图片
   * @param imageBuffer 原始图片buffer
   * @param maxSizeInMB 最大大小（MB）
   * @returns 压缩后的Buffer
   */
  private async compressImage(
    imageBuffer: ArrayBuffer,
    maxSizeInMB: number = 1,
  ): Promise<Uint8Array> {
    try {
      const { decode } = await import(
        "https://deno.land/x/imagescript@1.2.17/mod.ts"
      );
      // 解码图片
      const image = await decode(new Uint8Array(imageBuffer));
      const originalSize = imageBuffer.byteLength / (1024 * 1024); // 转换为MB

      // 根据原始大小决定压缩策略
      let quality: number;
      let scale = 1;

      if (originalSize > 5) {
        quality = 30;
        scale = 0.5;
      } else if (originalSize > 3) {
        quality = 40;
        scale = 0.6;
      } else if (originalSize > 2) {
        quality = 50;
        scale = 0.7;
      } else {
        quality = 60;
        scale = 0.8;
      }

      // 调整尺寸
      const newWidth = Math.round(image.width * scale);
      const newHeight = Math.round(image.height * scale);
      image.resize(newWidth, newHeight);

      // 编码压缩后的图片
      const output = await image.encode(quality);

      // 如果还是太大，再次尝试更激进的压缩
      if (output.length > maxSizeInMB * 1024 * 1024) {
        image.resize(Math.round(newWidth * 0.7), Math.round(newHeight * 0.7));
        return await image.encode(Math.max(quality - 20, 20));
      }

      return output;
    } catch (error) {
      console.error("Image compression failed:", error);
      throw error;
    }
  }

  /**
   * 处理文章内容中的所有图片
   */
  async processContent(content: string): Promise<{
    content: string;
    results: ImageProcessResult[];
  }> {
    const imageUrls = this.extractImageUrls(content);
    const results: ImageProcessResult[] = [];
    let processedContent = content;

    for (const image of imageUrls) {
      try {
        const downloadResult = await this.downloadImage(image.fetchUrl);
        if (!downloadResult.isValid || !downloadResult.imageBuffer) {
          results.push({
            originalUrl: image.originalUrl,
            error: downloadResult.error,
          });
          continue;
        }

        const imageBuffer = downloadResult.imageBuffer;

        let processedImage: Uint8Array | undefined;
        if (imageBuffer.byteLength > WeixinImageProcessor.MAX_IMAGE_SIZE) {
          console.log(
            `图片大小超过1MB (${
              (imageBuffer.byteLength / 1024 / 1024).toFixed(2)
            }MB)，进行压缩...`,
          );
          processedImage = await this.compressImage(imageBuffer);
          console.log(
            `压缩后大小: ${(processedImage.length / 1024 / 1024).toFixed(2)}MB`,
          );
        }

        // 上传图片到微信
        const newUrl = await this.imageUploader.uploadContentImage(
          image.fetchUrl,
          processedImage ? processedImage : new Uint8Array(imageBuffer),
        );

        results.push({
          originalUrl: image.originalUrl,
          newUrl,
        });

        // 替换文章中的图片URL
        processedContent = this.replaceImageUrl(
          processedContent,
          image.originalUrl,
          newUrl,
        );
        if (image.fetchUrl !== image.originalUrl) {
          processedContent = this.replaceImageUrl(
            processedContent,
            image.fetchUrl,
            newUrl,
          );
        }
      } catch (error) {
        console.error(`处理图片失败: ${image.originalUrl}`, error);
        results.push({
          originalUrl: image.originalUrl,
          error: error instanceof Error ? error.message : "未知错误",
        });
      }
    }

    return {
      content: processedContent,
      results,
    };
  }

  /**
   * 从文章内容中提取所有图片URL
   */
  private extractImageUrls(content: string): ExtractedImageUrl[] {
    const urls = new Map<string, ExtractedImageUrl>();
    const patterns = {
      markdown: /!\[[^\]]*\]\(([^)]+)\)/g,
      html: /<img[^>]+src=["']([^"']+)["'][^>]*>/g,
    };

    for (const [_, pattern] of Object.entries(patterns)) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        this.addExtractedImageUrl(urls, match[1]);
      }
    }

    const contentWithoutTaggedImages = content
      .replace(patterns.markdown, " ")
      .replace(patterns.html, " ");
    const plainUrlPattern =
      /(https?:\/\/[^\s<>"]+?\/[^\s<>"]+?\.(jpg|jpeg|png|gif|webp)(?:\?[^\s<>"]+)?)\b/gi;
    let match;
    while (
      (match = plainUrlPattern.exec(contentWithoutTaggedImages)) !== null
    ) {
      this.addExtractedImageUrl(urls, match[1]);
    }

    return Array.from(urls.values());
  }

  /**
   * 下载并验证图片URL是否有效
   */
  private async downloadImage(url: string): Promise<ImageDownloadResult> {
    try {
      const urlObj = new URL(url);
      const extension = urlObj.pathname.toLowerCase().split(".").pop();

      if (
        !extension ||
        !WeixinImageProcessor.VALID_IMAGE_EXTENSIONS.includes(`.${extension}`)
      ) {
        return {
          isValid: false,
          error: "不支持的图片格式",
        };
      }

      const response = await fetch(url);
      if (!response.ok) {
        return {
          isValid: false,
          error: `图片下载失败: HTTP ${response.status}`,
        };
      }

      const contentType = response.headers.get("content-type");

      if (!contentType || !contentType.startsWith("image/")) {
        return {
          isValid: false,
          error: "无效的Content-Type: " + contentType,
        };
      }

      return {
        isValid: true,
        contentType,
        imageBuffer: await response.arrayBuffer(),
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : "验证图片URL时发生错误",
      };
    }
  }

  /**
   * 替换文章中的图片URL
   */
  private replaceImageUrl(
    content: string,
    oldUrl: string,
    newUrl: string,
  ): string {
    const escapedOldUrl = this.escapeRegExp(oldUrl);
    return content
      .replace(
        new RegExp(`!\\[([^\\]]*)\\]\\(${escapedOldUrl}\\)`, "g"),
        `![$1](${newUrl})`,
      )
      .replace(
        new RegExp(`<img([^>]*)src=["']${escapedOldUrl}["']([^>]*)>`, "g"),
        `<img$1src="${newUrl}"$2>`,
      )
      .replace(new RegExp(escapedOldUrl, "g"), newUrl);
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private addExtractedImageUrl(
    urls: Map<string, ExtractedImageUrl>,
    originalUrl: string,
  ): void {
    const fetchUrl = decodeHtmlEntities(originalUrl.trim());
    if (!fetchUrl || urls.has(fetchUrl)) {
      return;
    }
    urls.set(fetchUrl, { originalUrl, fetchUrl });
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
