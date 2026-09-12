import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddItemForm } from "../../src/components/AddItemForm";
import { pendingItemActionLabel } from "../../src/pendingItemAction";

vi.mock("../../src/notifications", () => ({ notify: vi.fn() }));

let root: Root | null = null;

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("Input value setter is unavailable.");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

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
        onCapture: vi.fn(),
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

  it("routes a URL without manual fields through URL capture", async () => {
    const onCapture = vi.fn().mockResolvedValue(true);
    const onAdd = vi.fn().mockResolvedValue(true);
    await act(async () => {
      root?.render(createElement(AddItemForm, {
        onAdd,
        onCapture,
        onCancel: vi.fn(),
        state: "idle",
        formId: "test-form",
      }));
    });

    const urlInput = document.querySelector<HTMLInputElement>("#capture-url");
    const form = document.querySelector<HTMLFormElement>("#test-form");
    if (urlInput === null || form === null) throw new Error("Capture form did not render.");

    await act(async () => {
      setInputValue(urlInput, "https://example.com/article");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onCapture).toHaveBeenCalledWith({ url: "https://example.com/article" });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("keeps an explicit title on the URL capture path", async () => {
    const onCapture = vi.fn().mockResolvedValue(true);
    const onAdd = vi.fn().mockResolvedValue(true);
    await act(async () => {
      root?.render(createElement(AddItemForm, {
        onAdd,
        onCapture,
        onCancel: vi.fn(),
        state: "idle",
        formId: "test-form",
      }));
    });

    const titleInput = document.querySelector<HTMLInputElement>("#capture-title");
    const urlInput = document.querySelector<HTMLInputElement>("#capture-url");
    const form = document.querySelector<HTMLFormElement>("#test-form");
    if (titleInput === null || urlInput === null || form === null) {
      throw new Error("Capture form did not render.");
    }

    await act(async () => {
      setInputValue(titleInput, "My manual title");
      setInputValue(urlInput, "https://example.com/article");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onCapture).toHaveBeenCalledWith({
      title: "My manual title",
      url: "https://example.com/article",
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("keeps an explicit type on the URL capture path", async () => {
    const onCapture = vi.fn().mockResolvedValue(true);
    const onAdd = vi.fn().mockResolvedValue(true);
    await act(async () => {
      root?.render(createElement(AddItemForm, {
        onAdd,
        onCapture,
        onCancel: vi.fn(),
        state: "idle",
        formId: "test-form",
      }));
    });

    const trigger = document.querySelector<HTMLButtonElement>(".type-trigger");
    if (trigger === null) throw new Error("Type selector did not render.");
    await act(async () => {
      trigger.click();
    });
    const videoOption = Array.from(document.querySelectorAll<HTMLElement>(".type-option"))
      .find((option) => option.textContent?.includes("Video"));
    if (videoOption === undefined) throw new Error("Video type option did not render.");
    await act(async () => {
      videoOption.click();
    });

    const urlInput = document.querySelector<HTMLInputElement>("#capture-url");
    const form = document.querySelector<HTMLFormElement>("#test-form");
    if (urlInput === null || form === null) throw new Error("Capture form did not render.");

    await act(async () => {
      setInputValue(urlInput, "https://example.com/article");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onCapture).toHaveBeenCalledWith({
      url: "https://example.com/article",
      type: "video",
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("keeps non-link items on the manual path", async () => {
    const onCapture = vi.fn().mockResolvedValue(true);
    const onAdd = vi.fn().mockResolvedValue(true);
    await act(async () => {
      root?.render(createElement(AddItemForm, {
        onAdd,
        onCapture,
        onCancel: vi.fn(),
        state: "idle",
        formId: "test-form",
      }));
    });

    const titleInput = document.querySelector<HTMLInputElement>("#capture-title");
    const form = document.querySelector<HTMLFormElement>("#test-form");
    if (titleInput === null || form === null) throw new Error("Capture form did not render.");

    await act(async () => {
      setInputValue(titleInput, "Offline book");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onCapture).not.toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalledWith({ title: "Offline book", url: null, type: "article" });
  });
});
