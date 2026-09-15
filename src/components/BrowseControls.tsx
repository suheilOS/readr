import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { TYPE_OPTIONS, type ItemType } from "../../shared/item";
import {
  ITEM_SORT_OPTIONS,
  itemSortOptionFor,
  type ItemSort,
} from "../itemSorting";
import { CheckIcon, FilterIcon, SortIcon } from "./icons";
import { ItemTypeIcon } from "./ItemTypeIcon";

type OpenPopover = "sort" | "filter" | null;

type BrowseControlsProps = {
  sort: ItemSort;
  onSortChange: (sort: ItemSort) => void;
  selectedTypes: readonly ItemType[];
  onTypesChange: (types: ItemType[]) => void;
};

export function BrowseControls({
  sort,
  onSortChange,
  selectedTypes,
  onTypesChange,
}: BrowseControlsProps) {
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const selectedTypeSet = new Set(selectedTypes);
  const activeFilterCount = selectedTypeSet.size;
  const currentSortLabel = itemSortOptionFor(sort).label;

  function handlePopoverChange(popover: Exclude<OpenPopover, null>, open: boolean) {
    setOpenPopover((current) => {
      if (open) return popover;
      return current === popover ? null : current;
    });
  }

  function chooseSort(nextSort: ItemSort) {
    onSortChange(nextSort);
    setOpenPopover(null);
  }

  function toggleType(type: ItemType, checked: boolean) {
    const next = new Set(selectedTypeSet);
    if (checked) next.add(type);
    else next.delete(type);
    onTypesChange(TYPE_OPTIONS
      .map((option) => option.value)
      .filter((option) => next.has(option)));
  }

  function clearFilters() {
    onTypesChange([]);
  }

  return (
    <div className="browse-controls" role="group" aria-label="Sort and filter controls">
      <Popover.Root
        open={openPopover === "sort"}
        onOpenChange={(open) => handlePopoverChange("sort", open)}
      >
        <Popover.Trigger
          className="browse-control"
          type="button"
          aria-label={`Sort items: ${currentSortLabel}`}
          data-slot="popover-trigger"
        >
          <SortIcon />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className="browse-popover-positioner"
            side="bottom"
            align="end"
            sideOffset={8}
          >
            <Popover.Popup className="browse-popover">
              <Popover.Title className="browse-popover__title">Sort items</Popover.Title>
              <fieldset className="browse-options">
                <legend className="visually-hidden">Sort order</legend>
                {ITEM_SORT_OPTIONS.map((option) => (
                  <label className="browse-option" key={option.value}>
                    <input
                      type="radio"
                      name="item-sort"
                      value={option.value}
                      checked={sort === option.value}
                      onChange={() => chooseSort(option.value)}
                    />
                    <span className="browse-option__label">{option.label}</span>
                  </label>
                ))}
              </fieldset>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root
        open={openPopover === "filter"}
        onOpenChange={(open) => handlePopoverChange("filter", open)}
      >
        <Popover.Trigger
          className="browse-control"
          type="button"
          aria-label={activeFilterCount === 0
            ? "Filter items"
            : `Filter items, ${activeFilterCount} active`}
          data-active={activeFilterCount > 0 ? "" : undefined}
          data-slot="popover-trigger"
        >
          <FilterIcon />
          {activeFilterCount > 0 && <span className="browse-control__indicator" aria-hidden="true" />}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className="browse-popover-positioner"
            side="bottom"
            align="end"
            sideOffset={8}
          >
            <Popover.Popup className="browse-popover">
              <Popover.Title className="browse-popover__title">Filter items</Popover.Title>
              <fieldset className="browse-options">
                <legend className="visually-hidden">Filter by type</legend>
                {TYPE_OPTIONS.map((option) => {
                  const checked = selectedTypeSet.has(option.value);
                  return (
                    <label className="browse-option" key={option.value}>
                      <input
                        className="browse-option__input"
                        type="checkbox"
                        name={`item-filter-${option.value}`}
                        value={option.value}
                        checked={checked}
                        onChange={(event) => toggleType(option.value, event.target.checked)}
                      />
                      <span className="browse-option__label">
                        <ItemTypeIcon type={option.value} className="browse-option__type-icon" />
                        <span>{option.label}</span>
                      </span>
                      <span className="browse-option__indicator" aria-hidden="true">
                        {checked && <CheckIcon />}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              <div className="browse-popover__footer">
                <span className="browse-popover__summary">
                  {activeFilterCount === 0
                    ? "All types"
                    : `${activeFilterCount} type${activeFilterCount === 1 ? "" : "s"} selected`}
                </span>
                <button
                  className="browse-clear"
                  type="button"
                  disabled={activeFilterCount === 0}
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
