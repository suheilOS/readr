import { useEffect, useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { canReadInApp, DESK_CAPACITY, type Item, itemMetaLine, readerKindFor } from "../../shared/item";
import { runWithFocusRestoration } from "../focusAdjacentAction";
import { isPendingItemAction, type PendingItemAction } from "../pendingItemAction";
import {
  BookOpenIcon,
  CheckIcon,
  ExternalLinkIcon,
  InboxIcon,
  MoreVerticalIcon,
  TrashIcon,
  VideoIcon,
} from "./icons";


type DeskSectionProps = {
  items: Item[];
  deskCount: number;
  mode: "normal" | "swap";
  onFinish: (item: Item) => Promise<boolean>;
  onSendToInbox: (item: Item) => Promise<boolean>;
  onDiscard: (item: Item, trigger: HTMLButtonElement) => void;
  onRead: (item: Item) => void;
  onSelectSwapTarget: (item: Item) => Promise<boolean>;
  onCancelSwap: () => void;
  pendingAction: PendingItemAction | null;
};

export function DeskSection({
  items,
  deskCount,
  mode,
  onFinish,
  onSendToInbox,
  onDiscard,
  onRead,
  onSelectSwapTarget,
  onCancelSwap,
  pendingAction,
}: DeskSectionProps) {
  const swapActive = mode === "swap";
  const busy = pendingAction !== null;
  const firstSwapTargetRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (swapActive) firstSwapTargetRef.current?.focus();
  }, [swapActive]);


  return (
    <section className="desk" aria-labelledby="desk-heading">
      <div className="section-header">
        <h2 id="desk-heading" tabIndex={-1}>On your desk</h2>
        <span className="counter">
          {deskCount} / {DESK_CAPACITY}
        </span>
      </div>
      {swapActive && (
        <p role="status" className="swap-banner">
          Desk is full. Choose a card to replace, or{" "}
          <button type="button" className="inline-link-button" onClick={onCancelSwap} disabled={busy}>
            cancel
          </button>
        </p>
      )}
      <ul className="desk-list">
        {items.map((item, index) => (
          <li key={item.id} style={{ viewTransitionName: `item-${item.id}` }}>
            {swapActive ? (
              <button
                ref={index === 0 ? firstSwapTargetRef : undefined}
                type="button"
                className="desk-card swappable"
                aria-label={`Replace ${item.title}`}
                aria-busy={isPendingItemAction(pendingAction, item.id, "replace")}
                disabled={busy}
                onClick={(event) => {
                  runWithFocusRestoration(
                    event.currentTarget,
                    "desk-heading",
                    () => onSelectSwapTarget(item),
                  );
                }}
              >
                {isPendingItemAction(pendingAction, item.id, "replace") && (
                  <span className="desk-card-pending">
                    <span className="button-spinner" aria-hidden="true" />
                    <span>Replacing…</span>
                  </span>
                )}
                <span className="card-title">{item.title}</span>
                <span className="meta-line">{itemMetaLine(item)}</span>
              </button>
            ) : (
              <article className="desk-card">
                <h3 className="card-title">{item.title}</h3>
                <p className="meta-line">{itemMetaLine(item)}</p>
                <div className="card-actions">
                  {canReadInApp(item) && (
                    <button
                      type="button"
                      className="pill-button"
                      aria-label={`Open in readr: ${item.title}`}
                      data-reader-item-id={item.id}
                      onClick={() => onRead(item)}
                    >
                      {readerKindFor(item) === "youtube" ? (
                        <VideoIcon className="button-icon" />
                      ) : (
                        <BookOpenIcon className="button-icon" />
                      )}
                      <span>{readerKindFor(item) === "youtube" ? "Watch" : "Read"}</span>
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
                    aria-busy={isPendingItemAction(pendingAction, item.id, "finish")}
                    disabled={busy}
                    onClick={(event) => {
                      runWithFocusRestoration(
                        event.currentTarget,
                        "desk-heading",
                        () => onFinish(item),
                      );
                    }}
                  >
                    {isPendingItemAction(pendingAction, item.id, "finish") ? (
                      <>
                        <span className="button-spinner" aria-hidden="true" />
                        <span>Finishing…</span>
                      </>
                    ) : (
                      <>
                        <CheckIcon className="button-icon" />
                        <span>Finish</span>
                      </>
                    )}
                  </button>
                  <DeskActionsMenu
                    item={item}
                    onSendToInbox={onSendToInbox}
                    onDiscard={onDiscard}
                    pendingAction={pendingAction}
                  />
                </div>
              </article>
            )}
          </li>
        ))}
      </ul>
      {!swapActive && items.length === 0 && (
        <p className="empty-note">No items on your desk yet. Move one here from your inbox.</p>
      )}
    </section>
  );
}

type DeskActionsMenuProps = {
  item: Item;
  onSendToInbox: (item: Item) => Promise<boolean>;
  onDiscard: (item: Item, trigger: HTMLButtonElement) => void;
  pendingAction: PendingItemAction | null;
};

function DeskActionsMenu({
  item,
  onSendToInbox,
  onDiscard,
  pendingAction,
}: DeskActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busy = pendingAction !== null;

  function runAction(action: (item: Item) => Promise<boolean>) {
    const trigger = triggerRef.current;
    if (trigger === null) return;

    runWithFocusRestoration(trigger, "desk-heading", () => action(item));
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        ref={triggerRef}
        type="button"
        className="library-menu-trigger desk-menu-trigger"
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
              onClick={() => runAction(onSendToInbox)}
            >
              <InboxIcon className="button-icon" />
              <span>Move to inbox</span>
            </Menu.Item>
            <Menu.Item
              className="library-menu-item discard-menu-item"
              data-variant="destructive"
              disabled={busy}
              onClick={() => {
                const trigger = triggerRef.current;
                if (trigger !== null) onDiscard(item, trigger);
              }}
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
