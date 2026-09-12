import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { itemMetaLine, type Item } from "../../shared/item";
import { formatDate } from "../formatDate";
import { runWithFocusRestoration } from "../focusAdjacentAction";
import { isPendingItemAction, type PendingItemAction } from "../pendingItemAction";
import { ArrowUpIcon, InboxIcon, MoreVerticalIcon } from "./icons";


type LibrarySectionProps = {
  items: Item[];
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
      <ul className="row-list">
        {items.map((item) => (
          <li
            key={item.id}
            className="row finished"
            style={{ viewTransitionName: `item-${item.id}` }}
          >
            <div className="row-text">
              <span className="row-title">{item.title}</span>
              <span className="meta-line">
                {itemMetaLine(item)}
                {item.finishedAt !== null && ` · Finished ${formatDate(item.finishedAt)}`}
              </span>
              {item.note !== null && <p className="note-preview">{item.note}</p>}
            </div>
            <LibraryActionsMenu
              item={item}
              onSendToDesk={onSendToDesk}
              onSendToInbox={onSendToInbox}
              pendingAction={pendingAction}
            />
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="empty-note">No finished items yet. Items appear here when you finish them.</p>
      )}
    </section>
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
    <div className="row-actions library-actions">
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
