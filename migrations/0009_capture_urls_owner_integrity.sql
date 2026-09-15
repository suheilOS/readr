CREATE TRIGGER capture_urls_owner_insert
BEFORE INSERT ON capture_urls
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM items
  WHERE id = NEW.item_id AND user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'capture_urls owner mismatch');
END;

CREATE TRIGGER capture_urls_owner_update
BEFORE UPDATE OF item_id, user_id ON capture_urls
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM items
  WHERE id = NEW.item_id AND user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'capture_urls owner mismatch');
END;
