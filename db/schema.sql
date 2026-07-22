CREATE DATABASE IF NOT EXISTS app_review_insights CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE app_review_insights;

CREATE TABLE IF NOT EXISTS analysis_runs (
  id VARCHAR(64) PRIMARY KEY,
  app_url TEXT NOT NULL,
  goal TEXT,
  model_provider VARCHAR(64),
  model_name VARCHAR(128),
  used_model BOOLEAN DEFAULT FALSE,
  payload_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(128) PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  rating INT,
  app_version VARCHAR(64),
  author VARCHAR(255),
  updated_at_text VARCHAR(128),
  source VARCHAR(64),
  FOREIGN KEY (run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
);
