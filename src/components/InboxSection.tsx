import type { Item } from "../item";
import { itemMetaLine } from "../item";
import { focusAdjacentAction } from "../focusAdjacentAction";
import { ArrowUpIcon, TrashIcon } from "./icons";
import { isPendingItemAction, type PendingItemAction } from "../pendingItemAction";

type InboxSectionProps = {
  items: Item[];
  highlightId?: string | null;
  onSendToDesk: (item: Item) => void;
  onDiscard: (item: Item) => void;
  pendingAction: PendingItemAction | null;
};

export function InboxSection({
  items,
  highlightId,
  onSendToDesk,
  onDiscard,
  pendingAction,
}: InboxSectionProps) {
  const busy = pendingAction !== null;

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
                className="pill-button"
                aria-label={`Move to desk: ${item.title}`}
                aria-busy={isPendingItemAction(pendingAction, item.id, "move-to-desk")}
                disabled={busy}
                onClick={(event) => {
                  focusAdjacentAction(event.currentTarget, "inbox-heading");
                  onSendToDesk(item);
                }}
              >
                {isPendingItemAction(pendingAction, item.id, "move-to-desk") ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    <span>Moving…</span>
                  </>
                ) : (
                  <>
                    <ArrowUpIcon className="button-icon" />
                    <span>Move to desk</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="quiet-button discard"
                aria-label={`Discard: ${item.title}`}
                aria-busy={isPendingItemAction(pendingAction, item.id, "discard")}
                disabled={busy}
                onClick={(event) => {
                  focusAdjacentAction(event.currentTarget, "inbox-heading");
                  onDiscard(item);
                }}
              >
                {isPendingItemAction(pendingAction, item.id, "discard") ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    <span>Discarding…</span>
                  </>
                ) : (
                  <>
                    <TrashIcon className="button-icon" />
                    <span>Discard</span>
                  </>
                )}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="empty-note">No items in your inbox yet. Add a title or link above.</p>
      )}
    </section>
  );
}
