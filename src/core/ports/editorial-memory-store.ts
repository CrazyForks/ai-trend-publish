export interface EditorialArticleMemoryInput {
  runId: string;
  profileId?: string;
  title: string;
  thesis?: string;
  keywords: string[];
  topicTitles: string[];
  sourceUrls: string[];
  qualityScore?: number;
  publishStatus: string;
  dryRun: boolean;
  createdAt?: string;
}

export interface EditorialArticleMemory extends EditorialArticleMemoryInput {
  createdAt: string;
}

export interface SourcePerformanceRecord {
  url: string;
  group: string;
  runs: number;
  successes: number;
  failures: number;
  empty: number;
  totalArticles: number;
  lastStatus: "succeeded" | "failed" | "empty";
  lastProvider?: string;
  lastError?: string;
  lastRunId?: string;
  updatedAt: string;
}

export type EditorialFeedbackRating = "good" | "ok" | "bad";

export interface EditorialRunFeedbackInput {
  runId: string;
  profileId?: string;
  rating: EditorialFeedbackRating;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EditorialRunFeedback extends EditorialRunFeedbackInput {
  createdAt: string;
  updatedAt: string;
}

export interface EditorialSourceHealthFailure {
  provider: string;
  message: string;
}

export interface EditorialSourceHealthRecord {
  url: string;
  group: string;
  status: "succeeded" | "failed" | "empty";
  selectedProvider?: string;
  articleCount: number;
  failures: EditorialSourceHealthFailure[];
}

export interface EditorialSourceHealthReport {
  generatedAt: string;
  records: EditorialSourceHealthRecord[];
}

export interface EditorialMemoryContext {
  recentArticles: EditorialArticleMemory[];
  sourcePerformance: SourcePerformanceRecord[];
  recentFeedback: EditorialRunFeedback[];
}

export interface EditorialMemoryStore {
  getContext(options?: {
    profileId?: string;
    recentLimit?: number;
    sourceLimit?: number;
  }): Promise<EditorialMemoryContext>;

  recordArticle(input: EditorialArticleMemoryInput): Promise<void>;

  recordSourceHealth(
    runId: string,
    report: EditorialSourceHealthReport,
  ): Promise<void>;

  getFeedback(runId: string): Promise<EditorialRunFeedback | null>;

  saveFeedback(input: EditorialRunFeedbackInput): Promise<EditorialRunFeedback>;

  deleteFeedback(runId: string): Promise<boolean>;
}

export class NoopEditorialMemoryStore implements EditorialMemoryStore {
  getContext(): Promise<EditorialMemoryContext> {
    return Promise.resolve({
      recentArticles: [],
      sourcePerformance: [],
      recentFeedback: [],
    });
  }

  recordArticle(): Promise<void> {
    return Promise.resolve();
  }

  recordSourceHealth(): Promise<void> {
    return Promise.resolve();
  }

  getFeedback(): Promise<EditorialRunFeedback | null> {
    return Promise.resolve(null);
  }

  saveFeedback(
    input: EditorialRunFeedbackInput,
  ): Promise<EditorialRunFeedback> {
    const timestamp = new Date().toISOString();
    return Promise.resolve({
      ...input,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    });
  }

  deleteFeedback(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
