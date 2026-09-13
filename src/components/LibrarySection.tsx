import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { readerKindFor, type Item, type ItemListItem } from "../../shared/item";
import { formatCompactDate, formatDate } from "../formatDate";
import { runWithFocusRestoration } from "../focusAdjacentAction";
import { itemVisualFor } from "../itemPresentation";
import { isPendingItemAction, type PendingItemAction } from "../pendingItemAction";
import { EmptyState } from "./EmptyState";
import { ItemSourceLine } from "./ItemSourceLine";
import { ItemVisual } from "./ItemVisual";
import { ArrowUpIcon, InboxIcon, LibraryEmptyIcon, MoreVerticalIcon } from "./icons";

type LibrarySectionProps = {
  items: ItemListItem[];
  onSendToDesk: (item: Item) => Promise<boolean>;
  onSendToInbox: (item: Item) => Promise<boolean>;
  pendingAction: PendingItemAction | null;
};

export function LibrarySection({
  items,
  onSendToDesk,
  onSendToInbox,
  pendingAction,
}: LibrarySectionProps) {
  return (
    <section className="library" aria-labelledby="library-heading">
      <div className="section-header">
        <h2 id="library-heading" tabIndex={-1}>Library</h2>
        <span className="counter">{items.length}</span>
      </div>
      <ul className="library-list">
        {items.map((item) => {
          const visual = itemVisualFor(item);
          const className = `library-item${visual === null ? "" : " has-visual"}`;

          return (
            <li
              key={item.id}
              className={className}
              style={{ viewTransitionName: `item-${item.id}` }}
            >
              {visual !== null && (
                <ItemVisual
                  key={visual.imageUrl}
                  visual={visual}
                  itemType={item.type}
                  showPlay={readerKindFor(item) === "youtube"}
                />
              )}
              <div className="library-item-body">
                <LibraryItemDetails item={item} />
                {item.note !== null && item.note.trim().length > 0 && (
                  <p className="library-item-note">{item.note}</p>
                )}
                <LibraryActionsMenu
                  item={item}
                  onSendToDesk={onSendToDesk}
                  onSendToInbox={onSendToInbox}
                  pendingAction={pendingAction}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && (
        <EmptyState
          icon={<LibraryEmptyIcon />}
          message="No finished items yet. Items appear here when you finish them."
        />
      )}
    </section>
  );
}

function LibraryItemDetails({ item }: { item: ItemListItem }) {
  return (
    <>
      <h3 className="library-item-title">{item.title}</h3>
      <ItemSourceLine item={item} />
      {item.finishedAt !== null && (
        <time
          className="library-item-finished"
          dateTime={item.finishedAt}
          title={formatDate(item.finishedAt)}
        >
          Finished {formatCompactDate(item.finishedAt)}
        </time>
      )}
    </>
  );
}

type LibraryActionsMenuProps = {
  item: Item;
  onSendToDesk: (item: Item) => Promise<boolean>;
  onSendToInbox: (item: Item) => Promise<boolean>;
  pendingAction: PendingItemAction | null;
};

function LibraryActionsMenu({
  item,
  onSendToDesk,
  onSendToInbox,
  pendingAction,
}: LibraryActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busy = pendingAction !== null;

  function runAction(action: (item: Item) => Promise<boolean>) {
    const trigger = triggerRef.current;
    if (trigger === null) return;

    runWithFocusRestoration(trigger, "library-heading", () => action(item));
  }

  return (
    <div className="library-actions">
      <Menu.Root>
        <Menu.Trigger
          ref={triggerRef}
          type="button"
          className="library-menu-trigger"
          aria-label={isPendingItemAction(pendingAction, item.id)
            ? `Updating ${item.title}`
            : `More actions for ${item.title}`}
          aria-busy={isPendingItemAction(pendingAction, item.id)}
          disabled={busy}
          data-slot="menu-trigger"
        >
          {isPendingItemAction(pendingAction, item.id)
            ? <span className="button-spinner" aria-hidden="true" />
            : <MoreVerticalIcon />}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="library-menu-positioner" sideOffset={4} align="end">
            <Menu.Popup className="library-menu">
              <Menu.Item
                className="library-menu-item"
                disabled={busy}
                onClick={() => runAction(onSendToDesk)}
              >
                <ArrowUpIcon className="button-icon" />
                <span>Move to desk</span>
              </Menu.Item>
              <Menu.Item
                className="library-menu-item"
                disabled={busy}
                onClick={() => runAction(onSendToInbox)}
              >
                <InboxIcon className="button-icon" />
                <span>Move to inbox</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
