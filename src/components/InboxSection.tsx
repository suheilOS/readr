import type { Item } from "../item";
import { itemMetaLine } from "../item";
import { focusAdjacentAction } from "../focusAdjacentAction";

type InboxSectionProps = {
  items: Item[];
  highlightId?: string | null;
  onSendToDesk: (item: Item) => void;
  onDiscard: (item: Item) => void;
};

export function InboxSection({ items, highlightId, onSendToDesk, onDiscard }: InboxSectionProps) {
  return (
    <section className="inbox" aria-labelledby="inbox-heading">
      <div className="section-header">
        <h2 id="inbox-heading" tabIndex={-1}>Inbox</h2>
        <span className="counter">{items.length}</span>
      </div>
      <ul className="row-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={item.id === highlightId ? "row row-new" : "row"}
          >
            <div className="row-text">
              <span className="row-title">{item.title}</span>
              <span className="meta-line">{itemMetaLine(item)}</span>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="quiet-button"
                aria-label={`To desk: ${item.title}`}
                onClick={(event) => {
                  focusAdjacentAction(event.currentTarget, "inbox-heading");
                  onSendToDesk(item);
                }}
              >
                To desk
              </button>
              <button
                type="button"
                className="quiet-button discard"
                aria-label={`Discard: ${item.title}`}
                onClick={(event) => {
                  focusAdjacentAction(event.currentTarget, "inbox-heading");
                  onDiscard(item);
                }}
              >
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="empty-note">Inbox is empty.</p>
      )}
    </section>
  );
}
