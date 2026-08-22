import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { canReadInApp, DESK_CAPACITY, type Item, itemMetaLine } from "../item";
import { focusAdjacentAction } from "../focusAdjacentAction";
import {
  BookOpenIcon,
  CheckIcon,
  ExternalLinkIcon,
  InboxIcon,
  MoreVerticalIcon,
  TrashIcon,
} from "./icons";

type DeskSectionProps = {
  items: Item[];
  mode: "normal" | "swap";
  onFinish: (item: Item) => void;
  onSendToInbox: (item: Item) => void;
  onDiscard: (item: Item) => void;
  onRead: (item: Item, trigger: HTMLButtonElement) => void;
  onSelectSwapTarget: (item: Item) => void;
  onCancelSwap: () => void;
};

export function DeskSection({
  items,
  mode,
  onFinish,
  onSendToInbox,
  onDiscard,
  onRead,
  onSelectSwapTarget,
  onCancelSwap,
}: DeskSectionProps) {
  const swapActive = mode === "swap";

  return (
    <section className="desk" aria-labelledby="desk-heading">
      <div className="section-header">
        <h2 id="desk-heading" tabIndex={-1}>On your desk</h2>
        <span className="counter">
          {items.length} / {DESK_CAPACITY}
        </span>
      </div>
      {swapActive && (
        <p role="status" className="swap-banner">
          Desk is full. Choose a card to replace, or{" "}
          <button type="button" className="inline-link-button" onClick={onCancelSwap}>
            cancel
          </button>
        </p>
      )}
      <ul className="desk-list">
        {items.map((item) =>
          swapActive ? (
            <li key={item.id}>
              <button
                type="button"
                className="desk-card swappable"
                aria-label={`Replace ${item.title}`}
                onClick={(event) => {
                  focusAdjacentAction(event.currentTarget, "desk-heading");
                  onSelectSwapTarget(item);
                }}
              >
                <span className="card-title">{item.title}</span>
                <span className="meta-line">{itemMetaLine(item)}</span>
              </button>
            </li>
          ) : (
            <li key={item.id}>
              <article className="desk-card">
                <h3 className="card-title">{item.title}</h3>
                <p className="meta-line">{itemMetaLine(item)}</p>
                <div className="card-actions">
                  {canReadInApp(item) && (
                    <button
                      type="button"
                      className="pill-button"
                      aria-label={`Read in readr: ${item.title}`}
                      onClick={(event) => onRead(item, event.currentTarget)}
                    >
                      <BookOpenIcon className="button-icon" />
                      <span>Read</span>
                    </button>
                  )}
                  {item.url !== null && !canReadInApp(item) && (
                    <a
                      className="pill-button"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open original: ${item.title}`}
                    >
                      <ExternalLinkIcon className="button-icon" />
                      <span>Open original</span>
                    </a>
                  )}
                  <button
                    type="button"
                    className="pill-button finish-button"
                    aria-label={`Finish: ${item.title}`}
                    onClick={(event) => {
                      focusAdjacentAction(event.currentTarget, "desk-heading");
                      onFinish(item);
                    }}
                  >
                    <CheckIcon className="button-icon" />
                    <span>Finish</span>
                  </button>
                  <DeskActionsMenu
                    item={item}
                    onSendToInbox={onSendToInbox}
                    onDiscard={onDiscard}
                  />
                </div>
              </article>
            </li>
          ),
        )}
      </ul>
      {!swapActive && items.length === 0 && (
        <p className="empty-note">Your desk is empty. Move something in from the inbox.</p>
      )}
    </section>
  );
}

type DeskActionsMenuProps = {
  item: Item;
  onSendToInbox: (item: Item) => void;
  onDiscard: (item: Item) => void;
};

function DeskActionsMenu({
  item,
  onSendToInbox,
  onDiscard,
}: DeskActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  function runAction(action: (item: Item) => void) {
    if (triggerRef.current !== null) {
      focusAdjacentAction(triggerRef.current, "desk-heading");
    }

    action(item);
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        ref={triggerRef}
        type="button"
        className="library-menu-trigger desk-menu-trigger"
        aria-label={`More actions for ${item.title}`}
        data-cuelume-toggle=""
      >
        <MoreVerticalIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="library-menu-positioner" sideOffset={4} align="end">
          <Menu.Popup className="library-menu">
            <Menu.Item
              className="library-menu-item"
              onClick={() => runAction(onSendToInbox)}
            >
              <InboxIcon className="button-icon" />
              <span>Move to inbox</span>
            </Menu.Item>
            <Menu.Item
              className="library-menu-item discard-menu-item"
              onClick={() => runAction(onDiscard)}
            >
              <TrashIcon className="button-icon" />
              <span>Discard</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
