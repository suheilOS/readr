-- Align the main library query with its ownership and newest-first ordering.
CREATE INDEX items_user_added_id_idx
  ON items (user_id, added_at DESC, id DESC);
