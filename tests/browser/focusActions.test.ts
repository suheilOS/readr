import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../../shared/item";
import { DeskSection } from "../../src/components/DeskSection";
import { InboxSection } from "../../src/components/InboxSection";

let root: Root | null = null;

const inboxItems = [makeItem("inbox-1", "First inbox item"), makeItem("inbox-2", "Second inbox item")];
const deskItems = [makeItem("desk-1", "First desk item", "desk"), makeItem("desk-2", "Second desk item", "desk")];

function makeItem(id: string, title: string, status: Item["status"] = "inbox"): Item {
  return {
    id,
    title,
    url: null,
    type: "article",
    status,
    addedAt: "2026-08-23T12:00:00.000Z",
    finishedAt: null,
    note: null,
  };
}

function renderInbox(items: Item[], onSendToDesk: (item: Item) => Promise<boolean>) {
  root?.render(createElement(InboxSection, {
    items,
    onSendToDesk,
    onDiscard: vi.fn(),
    pendingAction: null,
  }));
}

function renderDesk(
  items: Item[],
  mode: "normal" | "swap",
  onFinish: (item: Item) => Promise<boolean>,
  onSelectSwapTarget: (item: Item) => Promise<boolean> = vi.fn().mockResolvedValue(false),
) {
  root?.render(createElement(DeskSection, {
    items,
    deskCount: items.length,
    mode,
    onFinish,
    onSendToInbox: vi.fn().mockResolvedValue(false),
    onDiscard: vi.fn(),
    onRead: vi.fn(),
    onSelectSwapTarget,
    onCancelSwap: vi.fn(),
    pendingAction: null,
  }));
}

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("lifecycle focus restoration", () => {
  it("focuses an adjacent inbox action after a successful move", async () => {
    const movement = deferred<boolean>();
    const onSendToDesk = vi.fn().mockReturnValue(movement.promise);
    await act(async () => renderInbox(inboxItems, onSendToDesk));

    const firstAction = document.querySelector<HTMLButtonElement>("[aria-label='Move to desk: First inbox item']");
    firstAction?.focus();
    firstAction?.click();

    await act(async () => {
      renderInbox([inboxItems[1]], onSendToDesk);
      movement.resolve(true);
      await movement.promise;
    });

    expect(document.activeElement).toBe(
      document.querySelector("[aria-label='Move to desk: Second inbox item']"),
    );
  });

  it("keeps the original inbox action focused when the move fails", async () => {
    const onSendToDesk = vi.fn().mockResolvedValue(false);
    await act(async () => renderInbox(inboxItems, onSendToDesk));

    const firstAction = document.querySelector<HTMLButtonElement>("[aria-label='Move to desk: First inbox item']");
    firstAction?.focus();
    firstAction?.click();
    await act(async () => await Promise.resolve());

    expect(document.activeElement).toBe(firstAction);
  });

  it("does not steal focus from a control chosen while the move is pending", async () => {
    const movement = deferred<boolean>();
    const onSendToDesk = vi.fn().mockReturnValue(movement.promise);
    await act(async () => renderInbox(inboxItems, onSendToDesk));

    const firstAction = document.querySelector<HTMLButtonElement>("[aria-label='Move to desk: First inbox item']");
    const search = document.createElement("input");
    document.body.append(search);
    firstAction?.focus();
    firstAction?.click();
    search.focus();

    await act(async () => {
      movement.resolve(true);
      await movement.promise;
    });

    expect(document.activeElement).toBe(search);
  });

  it("restores focus after finish and replacement only when each succeeds", async () => {
    const finish = deferred<boolean>();
    const onFinish = vi.fn().mockReturnValue(finish.promise);
    await act(async () => renderDesk(deskItems, "normal", onFinish));

    const finishButton = document.querySelector<HTMLButtonElement>("[aria-label='Finish: First desk item']");
    finishButton?.focus();
    finishButton?.click();
    await act(async () => {
      renderDesk([deskItems[1]], "normal", onFinish);
      finish.resolve(true);
      await finish.promise;
    });
    expect(document.activeElement).toBe(document.querySelector("[aria-label='Finish: Second desk item']"));

    const failedFinish = vi.fn().mockResolvedValue(false);
    await act(async () => renderDesk(deskItems, "normal", failedFinish));
    const failedButton = document.querySelector<HTMLButtonElement>("[aria-label='Finish: First desk item']");
    failedButton?.focus();
    failedButton?.click();
    await act(async () => await Promise.resolve());
    expect(document.activeElement).toBe(failedButton);

    const replacement = deferred<boolean>();
    const onSelectSwapTarget = vi.fn().mockReturnValue(replacement.promise);
    await act(async () => renderDesk(deskItems, "swap", vi.fn().mockResolvedValue(false), onSelectSwapTarget));
    const target = document.querySelector<HTMLButtonElement>("[aria-label='Replace First desk item']");
    target?.focus();
    target?.click();
    expect(onSelectSwapTarget).toHaveBeenCalledOnce();
    await act(async () => {
      renderDesk([deskItems[1]], "normal", vi.fn().mockResolvedValue(false), onSelectSwapTarget);
    });
    await act(async () => {
      replacement.resolve(true);
      await replacement.promise;
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector("[aria-label='Finish: Second desk item']"));
    });
  });
});
