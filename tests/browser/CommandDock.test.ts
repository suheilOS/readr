import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandDock, type CommandDockPanel } from "../../src/components/CommandDock";
import type { ItemType } from "../../shared/item";
import type { ItemSort } from "../../src/itemSorting";

let root: Root | null = null;

function renderDock({
  activePanel = null,
  sort = "added-desc",
  selectedTypes = [],
  captureState = "idle",
  onActivePanelChange = vi.fn(),
  onSortChange = vi.fn(),
  onTypesChange = vi.fn(),
}: {
  activePanel?: CommandDockPanel;
  sort?: ItemSort;
  selectedTypes?: ItemType[];
  captureState?: "idle" | "submitting";
  onActivePanelChange?: (panel: CommandDockPanel) => void;
  onSortChange?: (sort: ItemSort) => void;
  onTypesChange?: (types: ItemType[]) => void;
} = {}) {
  root?.render(createElement(CommandDock, {
    activePanel,
    onActivePanelChange,
    query: "",
    onQueryChange: vi.fn(),
    sort,
    onSortChange,
    selectedTypes,
    onTypesChange,
    theme: "light",
    onToggleTheme: vi.fn(),
    onSignOut: vi.fn(),
    onAdd: vi.fn().mockResolvedValue(true),
    onCapture: vi.fn().mockResolvedValue(true),
    captureState,
  }));
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("CommandDock", () => {
  it("requests the selected panel from a dock trigger", async () => {
    const onActivePanelChange = vi.fn();
    await act(async () => renderDock({ onActivePanelChange }));

    await act(async () => document.querySelector<HTMLButtonElement>("button[aria-label='Search']")?.click());

    expect(onActivePanelChange).toHaveBeenCalledWith("search");
  });

  it("applies sort choices and closes the panel", async () => {
    const onActivePanelChange = vi.fn();
    const onSortChange = vi.fn();
    await act(async () => renderDock({ activePanel: "sort", onActivePanelChange, onSortChange }));

    await act(async () => document.querySelector<HTMLInputElement>("input[value='title-asc']")?.click());

    expect(onSortChange).toHaveBeenCalledWith("title-asc");
    expect(onActivePanelChange).toHaveBeenCalledWith(null);
  });

  it("reports selected filters and preserves canonical option order", async () => {
    const onTypesChange = vi.fn();
    await act(async () => renderDock({ activePanel: "filter", selectedTypes: ["article"], onTypesChange }));

    expect(document.querySelector("[aria-label='Filter items, 1 active']")).not.toBeNull();
    await act(async () => document.querySelector<HTMLInputElement>("input[name='item-filter-video']")?.click());

    expect(onTypesChange).toHaveBeenCalledWith(["article", "video"]);
  });

  it("does not dismiss or switch capture while submission is pending", async () => {
    const onActivePanelChange = vi.fn();
    await act(async () => renderDock({
      activePanel: "capture",
      captureState: "submitting",
      onActivePanelChange,
    }));

    await act(async () => document.querySelector<HTMLButtonElement>("button[aria-label='Search']")?.click());
    await act(async () => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await act(async () => document.querySelector(".command-dock")?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    })));

    expect(onActivePanelChange).not.toHaveBeenCalled();
  });

  it("opens account as a nested settings panel", async () => {
    const onActivePanelChange = vi.fn();
    await act(async () => renderDock({ activePanel: "utilities", onActivePanelChange }));

    await act(async () => document.querySelector<HTMLButtonElement>(".command-dock__account-row")?.click());

    expect(onActivePanelChange).toHaveBeenCalledWith("account");
  });
});
