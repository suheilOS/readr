CREATE TABLE items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  type TEXT NOT NULL CHECK (type IN ('article', 'book', 'paper', 'video', 'podcast')),
  status TEXT NOT NULL CHECK (status IN ('inbox', 'desk', 'library')),
  added_at TEXT NOT NULL,
  finished_at TEXT,
  note TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX items_user_status_idx ON items (user_id, status);
CREATE INDEX items_user_updated_idx ON items (user_id, updated_at);
