import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { config, dataSources, vectorItems } from "@src/db/schema.ts";
import { Logger } from "@zilla/logger";
import type { ResolvedTrendPublishConfig } from "@src/utils/config/define-config.ts";

const logger = new Logger("DB");
const schema = {
  config,
  dataSources,
  vectorItems,
};
const activePools = new Set<mysql.Pool>();

export function createMysqlDatabase(
  dbConfig: ResolvedTrendPublishConfig["storage"]["mysql"],
) {
  logger.info("DB_HOST", dbConfig.host);
  logger.info("DB_PORT", dbConfig.port);
  logger.info("DB_USER", dbConfig.user);
  logger.info("DB_DATABASE", dbConfig.database);

  const poolConnection = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  activePools.add(poolConnection);

  const db = drizzle(poolConnection, {
    mode: "default",
    schema,
  });

  return {
    db,
    close: async () => {
      activePools.delete(poolConnection);
      await poolConnection.end();
    },
  };
}

export type TrendPublishDatabase = ReturnType<typeof createMysqlDatabase>["db"];

export async function closeDatabase(): Promise<void> {
  await Promise.all(
    [...activePools].map(async (pool) => {
      activePools.delete(pool);
      await pool.end();
    }),
  );
}
