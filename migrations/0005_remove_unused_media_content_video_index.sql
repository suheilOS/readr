-- media_content is addressed by item_id; no read path uses video_id directly.
DROP INDEX IF EXISTS media_content_video_idx;
