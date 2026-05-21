import {
  ProviderAdapter,
  ProviderCreateContext,
  ProviderRegistry,
} from "@src/registry/provider-registry.ts";
import {
  ImageGenerator,
  ImageGeneratorType,
} from "@src/core/ports/image-generator.ts";
import { TextLogoGenerator } from "@src/integrations/image/providers/text-logo-generator.ts";
import { PDD920LogoGenerator } from "@src/integrations/image/providers/pdd920-logo-generator.ts";
import { AliWanX21ImageGenerator } from "@src/integrations/image/providers/aliyun/aliwanx21-image-generator.ts";
import { AliyunWanxPosterGenerator } from "@src/integrations/image/providers/aliyun/aliwanx-poster-image-generator.ts";
import { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";

export interface ImageGeneratorAdapter
  extends ProviderAdapter<ResolvedTrendPublishConfig, ImageGeneratorType> {
  kind: "image";
  create(
    context?: ProviderCreateContext<ResolvedTrendPublishConfig>,
  ): ImageGenerator;
}

export const imageGeneratorRegistry = new ProviderRegistry<
  ResolvedTrendPublishConfig,
  ImageGeneratorAdapter
>();

imageGeneratorRegistry.register({
  id: ImageGeneratorType.TEXT_LOGO,
  kind: "image",
  isConfigured: () => true,
  create: () => new TextLogoGenerator(),
});

imageGeneratorRegistry.register({
  id: ImageGeneratorType.PDD920_LOGO,
  kind: "image",
  isConfigured: () => true,
  create: () => new PDD920LogoGenerator(),
});

imageGeneratorRegistry.register({
  id: ImageGeneratorType.ALIWANX21,
  kind: "image",
  isConfigured: (config) => Boolean(config.providers.image.dashscope.apiKey),
  create: (context) =>
    new AliWanX21ImageGenerator(
      context?.config?.providers.image.dashscope.apiKey,
    ),
});

imageGeneratorRegistry.register({
  id: ImageGeneratorType.ALIWANX_POSTER,
  kind: "image",
  isConfigured: (config) => Boolean(config.providers.image.dashscope.apiKey),
  create: (context) =>
    new AliyunWanxPosterGenerator(
      context?.config?.providers.image.dashscope.apiKey,
    ),
});
