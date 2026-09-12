-- Existing titles and types were explicitly entered. Never overwrite them.
ALTER TABLE items ADD COLUMN title_source TEXT NOT NULL DEFAULT 'manual'
  CHECK (title_source IN ('manual', 'automatic'));
ALTER TABLE items ADD COLUMN type_source TEXT NOT NULL DEFAULT 'manual'
  CHECK (type_source IN ('manual', 'automatic'));

-- Quick-capture identity is separate so historical/manual duplicates are retained.
CREATE TABLE capture_urls (
  user_id TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, normalized_url)
);
CREATE INDEX capture_urls_item_idx ON capture_urls(item_id);

CREATE TABLE item_metadata (
  item_id TEXT PRIMARY KEY NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_title TEXT,
  author TEXT,
  site_name TEXT,
  description TEXT,
  image_url TEXT,
  image_kind TEXT CHECK (image_kind IN ('thumbnail', 'cover', 'article-image')),
  inferred_type TEXT NOT NULL CHECK (inferred_type IN ('article', 'book', 'paper', 'video', 'podcast')),
  inference_source TEXT NOT NULL CHECK (inference_source IN ('url', 'schema', 'opengraph', 'mime', 'fallback')),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'processing', 'ready', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  enriched_at TEXT,
  error_code TEXT,
  CHECK ((image_url IS NULL) = (image_kind IS NULL)),
  CHECK (
    (state = 'processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR
    (state <> 'processing' AND lease_token IS NULL AND lease_until IS NULL)
  ),
  CHECK (state <> 'ready' OR enriched_at IS NOT NULL),
  CHECK (state <> 'failed' OR error_code IS NOT NULL)
);
CREATE INDEX item_metadata_pending_idx ON item_metadata(state, next_attempt_at);
CREATE INDEX item_metadata_lease_idx ON item_metadata(state, lease_until);
