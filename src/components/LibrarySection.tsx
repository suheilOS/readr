import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
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
            <LibraryActionsMenu
              item={item}
              onSendToDesk={onSendToDesk}
              onSendToInbox={onSendToInbox}
            />
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="empty-note">Nothing finished yet.</p>
      )}
    </section>
  );
}

type LibraryActionsMenuProps = {
  item: Item;
  onSendToDesk: (item: Item) => void;
  onSendToInbox: (item: Item) => void;
};

function LibraryActionsMenu({
  item,
  onSendToDesk,
  onSendToInbox,
}: LibraryActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  function runAction(action: (item: Item) => void) {
    if (triggerRef.current !== null) {
      focusAdjacentAction(triggerRef.current, "library-heading");
    }

    action(item);
  }

  return (
    <div className="row-actions library-actions">
      <Menu.Root>
        <Menu.Trigger
          ref={triggerRef}
          type="button"
          className="library-menu-trigger"
          aria-label={`More actions for ${item.title}`}
          data-cuelume-toggle=""
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="library-menu-positioner" sideOffset={4} align="end">
            <Menu.Popup className="library-menu">
              <Menu.Item
                className="library-menu-item"
                onClick={() => runAction(onSendToDesk)}
              >
                Move to desk
              </Menu.Item>
              <Menu.Item
                className="library-menu-item"
                onClick={() => runAction(onSendToInbox)}
              >
                Move to inbox
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
