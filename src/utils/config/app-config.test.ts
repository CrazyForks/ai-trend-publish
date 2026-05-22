import { assertEquals, assertRejects } from "@std/assert";
import {
  ConfigurationError,
  createConfigRuntime,
  initializeAppConfig,
  parseConfigArgs,
} from "@src/utils/config/app-config.ts";
import { defineConfig } from "@src/utils/config/define-config.ts";

Deno.test("parseConfigArgs extracts --config and keeps workflow args", () => {
  const parsed = parseConfigArgs([
    "--config",
    "./custom.config.ts",
    "--dry-run",
    "--max-articles",
    "3",
  ]);

  assertEquals(parsed.configPath, "./custom.config.ts");
  assertEquals(parsed.args, ["--dry-run", "--max-articles", "3"]);
});

Deno.test("parseConfigArgs supports --config=value", () => {
  const parsed = parseConfigArgs([
    "--dry-run",
    "--config=./docker.config.ts",
  ]);

  assertEquals(parsed.configPath, "./docker.config.ts");
  assertEquals(parsed.args, ["--dry-run"]);
});

Deno.test("initializeAppConfig resolves runtime config factory", async () => {
  const config = await initializeAppConfig({
    source: defineConfig((runtime) => ({
      server: {
        apiKey: runtime.required("SERVER_API_KEY"),
      },
      providers: {
        ai: {
          baseUrl: runtime.value("AI_BASE_URL"),
          apiKey: runtime.secret("AI_API_KEY"),
          model: runtime.value("AI_MODEL", "fallback-model"),
        },
      },
    })),
    runtime: createConfigRuntime({
      target: "docker",
      values: {
        SERVER_API_KEY: "server-key",
        AI_BASE_URL: "https://example.com/v1",
        AI_API_KEY: "ai-key",
      },
    }),
  });

  assertEquals(config.server.apiKey, "server-key");
  assertEquals(config.providers.ai.baseUrl, "https://example.com/v1");
  assertEquals(config.providers.ai.apiKey, "ai-key");
  assertEquals(config.providers.ai.model, "fallback-model");
});

Deno.test("initializeAppConfig rejects missing explicit config path", async () => {
  await assertRejects(
    () =>
      initializeAppConfig({
        configPath: "/tmp/trendpublish-missing-config-file.ts",
      }),
    ConfigurationError,
    "配置文件不存在",
  );
});
