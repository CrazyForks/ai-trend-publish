import { startCronJobs } from "@src/controllers/cron.ts";
import {
  initializeAppConfig,
  validateAppConfig,
} from "@src/utils/config/app-config.ts";
import { Logger, LogLevel } from "@zilla/logger";
import startServer from "@src/server.ts";
async function bootstrap() {
  await initializeAppConfig();
  await validateAppConfig({ requireLLM: true });

  Logger.level = LogLevel.INFO;

  startCronJobs();
  startServer();
}

bootstrap().catch(console.error);
