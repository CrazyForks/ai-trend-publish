import {
  ConfigManager,
  ConfigurationError,
} from "@src/utils/config/config-manager.ts";

export interface AppConfigValidationOptions {
  requireLLM?: boolean;
  requireWeixinPublish?: boolean;
}

export async function initializeAppConfig(): Promise<ConfigManager> {
  const configManager = ConfigManager.getInstance();
  await configManager.initDefaultConfigSources();
  return configManager;
}

export async function validateAppConfig(
  options: AppConfigValidationOptions = {},
): Promise<void> {
  const configManager = ConfigManager.getInstance();
  const missing: string[] = [];

  if (options.requireLLM) {
    await collectMissing(configManager, [
      "LLM_BASE_URL",
      "LLM_API_KEY",
      "LLM_MODEL",
    ], missing);
  }

  if (options.requireWeixinPublish) {
    await collectMissing(
      configManager,
      ["WEIXIN_APP_ID", "WEIXIN_APP_SECRET"],
      missing,
    );
  }

  if (missing.length > 0) {
    throw new ConfigurationError(`缺少必要配置: ${missing.join(", ")}`);
  }
}

export async function shutdownAppResources(): Promise<void> {
  const configManager = ConfigManager.getInstance();
  const dbEnabled = await configManager.getBoolean("ENABLE_DB", false);
  if (dbEnabled) {
    const { closeDatabase } = await import("@src/db/db.ts");
    await closeDatabase().catch(() => {});
  }
}

async function collectMissing(
  configManager: ConfigManager,
  keys: string[],
  missing: string[],
): Promise<void> {
  for (const key of keys) {
    const value = await configManager.getOptional<string>(key);
    if (!value) {
      missing.push(key);
    }
  }
}
