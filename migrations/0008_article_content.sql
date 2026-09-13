CREATE TABLE article_content (
  item_id TEXT PRIMARY KEY NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  title TEXT,
  author TEXT,
  word_count INTEGER,
  html TEXT,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'processing', 'ready', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  extracted_at TEXT,
  error_code TEXT,
  CHECK (
    (state = 'processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR
    (state <> 'processing' AND lease_token IS NULL AND lease_until IS NULL)
  ),
  CHECK (
    (state = 'ready' AND title IS NOT NULL AND word_count IS NOT NULL AND word_count >= 0 AND html IS NOT NULL AND extracted_at IS NOT NULL) OR
    state <> 'ready'
  )
);

CREATE INDEX article_content_pending_idx ON article_content(state, next_attempt_at);
CREATE INDEX article_content_lease_idx ON article_content(state, lease_until);
