ALTER TABLE items ADD COLUMN youtube_video_id TEXT;

CREATE UNIQUE INDEX items_user_youtube_video_idx
  ON items (user_id, youtube_video_id)
  WHERE youtube_video_id IS NOT NULL;
