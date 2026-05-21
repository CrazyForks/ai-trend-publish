import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ResolvedTrendPublishConfig,
  resolveTrendPublishConfig,
  TrendPublishConfig,
} from "@src/utils/config/define-config.ts";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export interface AppConfigValidationOptions {
  requireLLM?: boolean;
  requireWeixinPublish?: boolean;
}

const CONFIG_FILE_NAME = "trendpublish.config.ts";
let cachedConfig: ResolvedTrendPublishConfig | undefined;

interface ConfigModule {
  default?: TrendPublishConfig;
  config?: TrendPublishConfig;
}

export async function initializeAppConfig(): Promise<
  ResolvedTrendPublishConfig
> {
  cachedConfig = await loadAppConfig();
  return cachedConfig;
}

export async function getAppConfig(): Promise<ResolvedTrendPublishConfig> {
  if (!cachedConfig) {
    cachedConfig = await loadAppConfig();
  }
  return cachedConfig;
}

export async function reloadAppConfig(): Promise<ResolvedTrendPublishConfig> {
  cachedConfig = await loadAppConfig(true);
  return cachedConfig;
}

export async function validateAppConfig(
  options: AppConfigValidationOptions = {},
): Promise<void> {
  const config = await getAppConfig();
  const missing: string[] = [];

  if (options.requireLLM) {
    collectMissing([
      ["providers.ai.baseUrl", config.providers.ai.baseUrl],
      ["providers.ai.apiKey", config.providers.ai.apiKey],
      ["providers.ai.model", config.providers.ai.model],
    ], missing);
  }

  if (options.requireWeixinPublish) {
    collectMissing([
      ["providers.publish.weixin.appId", config.providers.publish.weixin.appId],
      [
        "providers.publish.weixin.appSecret",
        config.providers.publish.weixin.appSecret,
      ],
    ], missing);
  }

  if (missing.length > 0) {
    throw new ConfigurationError(`缺少必要配置: ${missing.join(", ")}`);
  }
}

export async function shutdownAppResources(): Promise<void> {
  const config = await getAppConfig();
  if (config.storage.mysql.enabled) {
    const { closeDatabase } = await import("@src/db/db.ts");
    await closeDatabase().catch(() => {});
  }
}

async function loadAppConfig(
  bustCache = false,
): Promise<ResolvedTrendPublishConfig> {
  const configPath = resolve(Deno.cwd(), CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    return resolveTrendPublishConfig({});
  }

  const moduleUrl = pathToFileURL(configPath).href;
  const cacheSuffix = bustCache ? `?t=${Date.now()}` : "";
  const module = await import(`${moduleUrl}${cacheSuffix}`) as ConfigModule;
  return resolveTrendPublishConfig(module.default ?? module.config ?? {});
}

function collectMissing(
  entries: [name: string, value: string][],
  missing: string[],
): void {
  for (const [name, value] of entries) {
    if (!value) {
      missing.push(name);
    }
  }
}
