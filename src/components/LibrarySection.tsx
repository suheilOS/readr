import type { Item } from "../item";
import { itemMetaLine } from "../item";
import { formatDate } from "../formatDate";
import { focusAdjacentAction } from "../focusAdjacentAction";

type LibrarySectionProps = {
  items: Item[];
  onSendToDesk: (item: Item) => void;
  onSendToInbox: (item: Item) => void;
};

export function LibrarySection({ items, onSendToDesk, onSendToInbox }: LibrarySectionProps) {
  return (
    <section className="library" aria-labelledby="library-heading">
      <div className="section-header">
        <h2 id="library-heading" tabIndex={-1}>Library</h2>
        <span className="counter">{items.length}</span>
      </div>
      <ul className="row-list">
        {items.map((item) => (
          <li key={item.id} className="row finished">
            <div className="row-text">
              <span className="row-title">{item.title}</span>
              <span className="meta-line">
                {itemMetaLine(item)}
                {item.finishedAt !== null && ` · Finished ${formatDate(item.finishedAt)}`}
              </span>
              {item.note !== null && <p className="note-preview">{item.note}</p>}
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="quiet-button"
                aria-label={`To desk: ${item.title}`}
                onClick={(event) => {
                  focusAdjacentAction(event.currentTarget, "library-heading");
                  onSendToDesk(item);
                }}
              >
                To desk
              </button>
              <button
                type="button"
                className="quiet-button"
                aria-label={`To inbox: ${item.title}`}
                onClick={(event) => {
                  focusAdjacentAction(event.currentTarget, "library-heading");
                  onSendToInbox(item);
                }}
              >
                To inbox
              </button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="empty-note">Nothing finished yet.</p>
      )}
    </section>
  );
}
