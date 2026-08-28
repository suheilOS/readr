CREATE TABLE media_progress (
  item_id TEXT PRIMARY KEY NOT NULL,
  position_seconds REAL NOT NULL CHECK (position_seconds >= 0),
  duration_seconds REAL NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 2678400),
  revision TEXT NOT NULL CHECK (length(revision) = 57),
  updated_at TEXT NOT NULL,
  CHECK (position_seconds <= duration_seconds),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);
