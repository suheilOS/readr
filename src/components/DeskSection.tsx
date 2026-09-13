import { useEffect, useRef, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  DESK_CAPACITY,
  type Item,
  type ItemListItem,
  readerKindFor,
} from "../../shared/item";
import { runWithFocusRestoration } from "../focusAdjacentAction";
import { itemAuthorFor, itemVisualFor } from "../itemPresentation";
import { isPendingItemAction, type PendingItemAction } from "../pendingItemAction";
import { EmptyState } from "./EmptyState";
import { ItemMetadataLine } from "./ItemMetadataLine";
import { ItemVisual } from "./ItemVisual";
import {
  BookOpenIcon,
  CheckIcon,
  DeskEmptyIcon,
  ExternalLinkIcon,
  InboxIcon,
  MoreVerticalIcon,
  TrashIcon,
  VideoIcon,
} from "./icons";

type DeskSectionProps = {
  items: ItemListItem[];
  deskCount: number;
  mode: "normal" | "swap";
  onFinish: (item: Item) => Promise<boolean>;
  onSendToInbox: (item: Item) => Promise<boolean>;
  onDiscard: (item: Item, trigger: HTMLButtonElement) => void;
  onRead: (item: Item) => void;
  onReadIntent: () => void;
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
  onReadIntent,
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
        {items.map((item, index) => {
          const visual = itemVisualFor(item);
          const readerKind = readerKindFor(item);
          const cardClassName = `desk-card${visual === null ? "" : " has-visual"}`;

          return (
            <li key={item.id} style={{ viewTransitionName: `item-${item.id}` }}>
              {swapActive ? (
                <button
                  ref={index === 0 ? firstSwapTargetRef : undefined}
                  type="button"
                  className={`${cardClassName} swappable`}
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
                  {visual !== null && (
                    <ItemVisual key={visual.imageUrl} visual={visual} />
                  )}
                  <span className="desk-card-body">
                    {isPendingItemAction(pendingAction, item.id, "replace") && (
                      <span className="desk-card-pending">
                        <span className="button-spinner" aria-hidden="true" />
                        <span>Replacing…</span>
                      </span>
                    )}
                    <DeskCardDetails
                      item={item}
                      titleContent={<span className="card-title">{item.title}</span>}
                    />
                  </span>
                </button>
              ) : (
                <article className={cardClassName}>
                  {visual !== null && (
                    <ItemVisual key={visual.imageUrl} visual={visual} />
                  )}
                  <div className="desk-card-body">
                    <DeskCardDetails
                      item={item}
                      titleContent={<h3 className="card-title">{item.title}</h3>}
                    />
                    <div className="card-actions">
                      {readerKind !== null && (
                        <button
                          type="button"
                          className="pill-button"
                          aria-label={`Open in readr: ${item.title}`}
                          data-reader-item-id={item.id}
                          onMouseEnter={onReadIntent}
                          onFocus={onReadIntent}
                          onClick={() => onRead(item)}
                        >
                          {readerKind === "youtube" ? (
                            <VideoIcon className="button-icon" />
                          ) : (
                            <BookOpenIcon className="button-icon" />
                          )}
                          <span>{readerKind === "youtube" ? "Watch" : "Read"}</span>
                        </button>
                      )}
                      {item.url !== null && readerKind === null && (
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
                    </div>
                  </div>
                  <DeskActionsMenu
                    item={item}
                    onSendToInbox={onSendToInbox}
                    onDiscard={onDiscard}
                    pendingAction={pendingAction}
                  />
                </article>
              )}
            </li>
          );
        })}
      </ul>
      {!swapActive && items.length === 0 && (
        <EmptyState
          icon={<DeskEmptyIcon />}
          message="No items on your desk yet. Move one here from your inbox."
        />
      )}
    </section>
  );
}

function DeskCardDetails({
  item,
  titleContent,
}: {
  item: ItemListItem;
  titleContent: ReactNode;
}) {
  const author = itemAuthorFor(item);

  return (
    <>
      <ItemMetadataLine item={item} className="desk-card-meta" />
      {titleContent}
      {author !== null && <span className="desk-card-author">{author}</span>}
    </>
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
