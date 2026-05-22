export const ARTICLE_WORKFLOW_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS article_runs (
  run_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  dry_run INTEGER NOT NULL,
  trigger_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  summary TEXT,
  error TEXT,
  artifacts_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS article_run_steps (
  run_id TEXT NOT NULL,
  name TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  input_artifacts_json TEXT NOT NULL DEFAULT '[]',
  output_artifacts_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  PRIMARY KEY (run_id, name, attempt)
);
CREATE TABLE IF NOT EXISTS article_publish_results (
  run_id TEXT PRIMARY KEY,
  publish_id TEXT,
  status TEXT,
  platform TEXT,
  url TEXT,
  published_at TEXT,
  result_json TEXT
);
CREATE TABLE IF NOT EXISTS article_vectors (
  id INTEGER PRIMARY KEY,
  content TEXT,
  vector_json TEXT NOT NULL,
  vector_dim INTEGER,
  vector_type TEXT
);
`;
