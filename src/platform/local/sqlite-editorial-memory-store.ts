import { Database } from "@db/sqlite";
import { dirname } from "node:path";
import { ARTICLE_WORKFLOW_SCHEMA_SQL } from "@src/core/storage/article-workflow-schema.ts";
import type {
  EditorialArticleMemory,
  EditorialArticleMemoryInput,
  EditorialMemoryContext,
  EditorialMemoryStore,
  EditorialRunFeedback,
  EditorialRunFeedbackInput,
  EditorialSourceHealthReport,
  SourcePerformanceRecord,
} from "@src/core/ports/editorial-memory-store.ts";

export class SQLiteEditorialMemoryStore implements EditorialMemoryStore {
  private db?: Database;

  constructor(private readonly databasePath: string) {}

  async getContext(options: {
    profileId?: string;
    recentLimit?: number;
    sourceLimit?: number;
  } = {}): Promise<EditorialMemoryContext> {
    const db = this.getDb();
    const recentLimit = options.recentLimit ?? 12;
    const sourceLimit = options.sourceLimit ?? 30;
    const articleRows = options.profileId
      ? db.prepare(
        "SELECT * FROM editorial_article_memory WHERE profile_id = ? OR profile_id IS NULL ORDER BY created_at DESC LIMIT ?",
      ).all(options.profileId, recentLimit) as ArticleMemoryRow[]
      : db.prepare(
        "SELECT * FROM editorial_article_memory ORDER BY created_at DESC LIMIT ?",
      ).all(recentLimit) as ArticleMemoryRow[];
    const sourceRows = db.prepare(
      "SELECT * FROM editorial_source_performance ORDER BY updated_at DESC LIMIT ?",
    ).all(sourceLimit) as SourcePerformanceRow[];
    const feedbackRows = options.profileId
      ? db.prepare(
        "SELECT * FROM editorial_run_feedback WHERE profile_id = ? OR profile_id IS NULL ORDER BY updated_at DESC LIMIT ?",
      ).all(options.profileId, recentLimit) as FeedbackRow[]
      : db.prepare(
        "SELECT * FROM editorial_run_feedback ORDER BY updated_at DESC LIMIT ?",
      ).all(recentLimit) as FeedbackRow[];
    return {
      recentArticles: articleRows.map(rowToArticleMemory),
      sourcePerformance: sourceRows.map(rowToSourcePerformance),
      recentFeedback: feedbackRows.map(rowToFeedback),
    };
  }

  async recordArticle(input: EditorialArticleMemoryInput): Promise<void> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    this.getDb().prepare(
      `INSERT OR REPLACE INTO editorial_article_memory
      (run_id, profile_id, title, thesis, keywords_json, topic_titles_json, source_urls_json, quality_score, publish_status, dry_run, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.runId,
      input.profileId ?? null,
      input.title,
      input.thesis ?? null,
      JSON.stringify(input.keywords),
      JSON.stringify(input.topicTitles),
      JSON.stringify(input.sourceUrls),
      input.qualityScore ?? null,
      input.publishStatus,
      input.dryRun ? 1 : 0,
      createdAt,
    );
  }

  async recordSourceHealth(
    runId: string,
    report: EditorialSourceHealthReport,
  ): Promise<void> {
    const db = this.getDb();
    const updatedAt = report.generatedAt || new Date().toISOString();
    for (const record of report.records) {
      const error = record.failures[0]
        ? `${record.failures[0].provider}: ${record.failures[0].message}`
        : null;
      db.prepare(
        `INSERT INTO editorial_source_performance
        (url, group_name, runs, successes, failures, empty, total_articles, last_status, last_provider, last_error, last_run_id, updated_at)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
          group_name = excluded.group_name,
          runs = editorial_source_performance.runs + 1,
          successes = editorial_source_performance.successes + excluded.successes,
          failures = editorial_source_performance.failures + excluded.failures,
          empty = editorial_source_performance.empty + excluded.empty,
          total_articles = editorial_source_performance.total_articles + excluded.total_articles,
          last_status = excluded.last_status,
          last_provider = excluded.last_provider,
          last_error = excluded.last_error,
          last_run_id = excluded.last_run_id,
          updated_at = excluded.updated_at`,
      ).run(
        record.url,
        record.group,
        record.status === "succeeded" ? 1 : 0,
        record.status === "failed" ? 1 : 0,
        record.status === "empty" ? 1 : 0,
        record.articleCount,
        record.status,
        record.selectedProvider ?? null,
        error,
        runId,
        updatedAt,
      );
    }
  }

  async getFeedback(runId: string): Promise<EditorialRunFeedback | null> {
    const row = this.getDb().prepare(
      "SELECT * FROM editorial_run_feedback WHERE run_id = ?",
    ).get(runId) as FeedbackRow | undefined;
    return row ? rowToFeedback(row) : null;
  }

  async saveFeedback(
    input: EditorialRunFeedbackInput,
  ): Promise<EditorialRunFeedback> {
    const existing = await this.getFeedback(input.runId);
    const timestamp = new Date().toISOString();
    const createdAt = input.createdAt ?? existing?.createdAt ?? timestamp;
    const updatedAt = input.updatedAt ?? timestamp;
    this.getDb().prepare(
      `INSERT OR REPLACE INTO editorial_run_feedback
      (run_id, profile_id, rating, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.runId,
      input.profileId ?? existing?.profileId ?? null,
      input.rating,
      input.note?.trim() || null,
      createdAt,
      updatedAt,
    );
    return (await this.getFeedback(input.runId))!;
  }

  async deleteFeedback(runId: string): Promise<boolean> {
    const existing = await this.getFeedback(runId);
    if (!existing) return false;
    this.getDb().prepare("DELETE FROM editorial_run_feedback WHERE run_id = ?")
      .run(runId);
    return true;
  }

  private getDb(): Database {
    if (!this.db) {
      if (this.databasePath !== ":memory:") {
        Deno.mkdirSync(dirname(this.databasePath), { recursive: true });
      }
      this.db = new Database(this.databasePath);
      this.db.exec(ARTICLE_WORKFLOW_SCHEMA_SQL);
    }
    return this.db;
  }
}

interface ArticleMemoryRow {
  run_id: string;
  profile_id: string | null;
  title: string;
  thesis: string | null;
  keywords_json: string;
  topic_titles_json: string;
  source_urls_json: string;
  quality_score: number | null;
  publish_status: string;
  dry_run: number;
  created_at: string;
}

interface SourcePerformanceRow {
  url: string;
  group_name: string;
  runs: number;
  successes: number;
  failures: number;
  empty: number;
  total_articles: number;
  last_status: "succeeded" | "failed" | "empty";
  last_provider: string | null;
  last_error: string | null;
  last_run_id: string | null;
  updated_at: string;
}

interface FeedbackRow {
  run_id: string;
  profile_id: string | null;
  rating: "good" | "ok" | "bad";
  note: string | null;
  created_at: string;
  updated_at: string;
}

function rowToArticleMemory(row: ArticleMemoryRow): EditorialArticleMemory {
  return {
    runId: row.run_id,
    profileId: row.profile_id ?? undefined,
    title: row.title,
    thesis: row.thesis ?? undefined,
    keywords: parseStringArray(row.keywords_json),
    topicTitles: parseStringArray(row.topic_titles_json),
    sourceUrls: parseStringArray(row.source_urls_json),
    qualityScore: row.quality_score ?? undefined,
    publishStatus: row.publish_status,
    dryRun: Boolean(row.dry_run),
    createdAt: row.created_at,
  };
}

function rowToSourcePerformance(
  row: SourcePerformanceRow,
): SourcePerformanceRecord {
  return {
    url: row.url,
    group: row.group_name,
    runs: Number(row.runs),
    successes: Number(row.successes),
    failures: Number(row.failures),
    empty: Number(row.empty),
    totalArticles: Number(row.total_articles),
    lastStatus: row.last_status,
    lastProvider: row.last_provider ?? undefined,
    lastError: row.last_error ?? undefined,
    lastRunId: row.last_run_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

function rowToFeedback(row: FeedbackRow): EditorialRunFeedback {
  return {
    runId: row.run_id,
    profileId: row.profile_id ?? undefined,
    rating: row.rating,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
