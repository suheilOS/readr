import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddItemForm } from "../../src/components/AddItemForm";
import { pendingItemActionLabel } from "../../src/pendingItemAction";

vi.mock("../../src/notifications", () => ({ notify: vi.fn() }));

let root: Root | null = null;

beforeEach(() => {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("capture and lifecycle status labels", () => {
  it("keeps the add form disabled with an explicit loading label while capture is pending", async () => {
    await act(async () => {
      root?.render(createElement(AddItemForm, {
        onAdd: vi.fn(),
        onCancel: vi.fn(),
        state: "submitting",
        formId: "test-form",
      }));
    });

    const submit = document.querySelector<HTMLButtonElement>("[type='submit']");
    expect(submit?.disabled).toBe(true);
    expect(submit?.getAttribute("aria-busy")).toBe("true");
    expect(submit?.textContent).toContain("Adding…");
    expect(document.querySelector("[role='status']")?.textContent).toBe("Adding to inbox.");
  });

  it("keeps lifecycle status labels separate from capture status", () => {
    expect(pendingItemActionLabel({ kind: "move-to-desk", itemId: "item-1" })).toBe("Moving item.");
    expect(pendingItemActionLabel({ kind: "finish", itemId: "item-1" })).toBe("Finishing item.");
    expect(pendingItemActionLabel({ kind: "replace", itemId: "item-1" })).toBe("Replacing desk item.");
  });
});
