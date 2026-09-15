import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowseControls } from "../../src/components/BrowseControls";
import type { ItemType } from "../../shared/item";
import type { ItemSort } from "../../src/itemSorting";

let root: Root | null = null;

function renderControls(
  sort: ItemSort = "added-desc",
  selectedTypes: ItemType[] = [],
  onSortChange = vi.fn(),
  onTypesChange = vi.fn(),
) {
  root?.render(createElement(BrowseControls, {
    sort,
    onSortChange,
    selectedTypes,
    onTypesChange,
  }));
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
});

describe("BrowseControls", () => {
  it("opens sort choices and reports the selected order", async () => {
    const onSortChange = vi.fn();
    await act(async () => renderControls("added-desc", [], onSortChange));

    const sortButton = document.querySelector<HTMLButtonElement>("[aria-label='Sort items: Newest added']");
    expect(sortButton).not.toBeNull();
    await act(async () => sortButton?.click());

    const sortOption = document.querySelector<HTMLInputElement>("input[type='radio'][value='title-asc']");
    expect(sortOption).not.toBeNull();
    await act(async () => sortOption?.click());

    expect(onSortChange).toHaveBeenCalledWith("title-asc");
  });

  it("reports multiple selected types and marks the filter control active", async () => {
    const onTypesChange = vi.fn();
    await act(async () => renderControls("added-desc", ["article"], vi.fn(), onTypesChange));

    const filterButton = document.querySelector<HTMLButtonElement>("[aria-label='Filter items, 1 active']");
    expect(filterButton).not.toBeNull();
    await act(async () => filterButton?.click());

    const video = document.querySelector<HTMLInputElement>("input[name='item-filter-video']");
    expect(video).not.toBeNull();

    await act(async () => video?.click());

    expect(onTypesChange).toHaveBeenCalledWith(["article", "video"]);
  });

  it("uses the app check icon for selected filters", async () => {
    await act(async () => renderControls("added-desc", ["article"]));

    const filterButton = document.querySelector<HTMLButtonElement>("[aria-label='Filter items, 1 active']");
    expect(filterButton).not.toBeNull();
    await act(async () => filterButton?.click());

    const selectedInput = document.querySelector<HTMLInputElement>("input[name='item-filter-article']");
    const selectedIndicator = selectedInput?.nextElementSibling;
    expect(selectedIndicator?.classList.contains("is-checked")).toBe(true);
    expect(selectedIndicator?.querySelector("svg")).not.toBeNull();

    const unselectedInput = document.querySelector<HTMLInputElement>("input[name='item-filter-video']");
    const unselectedIndicator = unselectedInput?.nextElementSibling;
    expect(unselectedIndicator?.classList.contains("is-checked")).toBe(false);
    expect(unselectedIndicator?.querySelector("svg")).toBeNull();
  });

  it("clears selected filters", async () => {
    const onTypesChange = vi.fn();
    await act(async () => renderControls("added-desc", ["article", "video"], vi.fn(), onTypesChange));

    const filterButton = document.querySelector<HTMLButtonElement>("[aria-label='Filter items, 2 active']");
    expect(filterButton).not.toBeNull();
    await act(async () => filterButton?.click());

    const clearButton = document.querySelector<HTMLButtonElement>(".browse-clear");
    expect(clearButton).not.toBeNull();
    await act(async () => clearButton?.click());

    expect(onTypesChange).toHaveBeenCalledWith([]);
  });

  it("announces active filter count", async () => {
    await act(async () => renderControls("added-desc", ["article", "video"]));

    const filterButton = document.querySelector<HTMLButtonElement>("[aria-label='Filter items, 2 active']");
    expect(filterButton).not.toBeNull();
    expect(filterButton?.hasAttribute("data-active")).toBe(true);
  });
});
