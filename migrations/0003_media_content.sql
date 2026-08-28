CREATE TABLE media_content (
  item_id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  thumbnail_url TEXT,
  transcript_json TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX media_content_video_idx ON media_content (video_id);
