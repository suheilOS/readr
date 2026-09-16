import { Tooltip } from "@base-ui/react/tooltip";
import { useEffect, useRef, type ReactNode, type Ref } from "react";
import type { ItemType } from "../../shared/item";
import type { CaptureInput } from "../../shared/capture";
import { itemSortOptionFor, type ItemSort } from "../itemSorting";
import type { AddItemFormState, NewItemInput } from "./AddItemForm";
import { CommandDockPanels, type CommandDockPanel } from "./CommandDockPanels";
import { FilterIcon, PlusIcon, SearchIcon, SlidersIcon, SortIcon, XIcon } from "./icons";
import type { Theme } from "./ThemeToggle";

export type { CommandDockPanel } from "./CommandDockPanels";

type PrimaryPanel = Exclude<CommandDockPanel, "account" | null>;

type CommandDockProps = {
  activePanel: CommandDockPanel;
  onActivePanelChange: (panel: CommandDockPanel) => void;
  query: string;
  onQueryChange: (query: string) => void;
  sort: ItemSort;
  onSortChange: (sort: ItemSort) => void;
  selectedTypes: readonly ItemType[];
  onTypesChange: (types: ItemType[]) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onAdd: (input: NewItemInput) => Promise<boolean>;
  onCapture: (input: CaptureInput) => Promise<boolean>;
  captureState: AddItemFormState;
  captureTriggerRef?: Ref<HTMLButtonElement>;
  captureUrlRef?: Ref<HTMLInputElement>;
};

type DockTriggerProps = {
  panel: PrimaryPanel;
  label: string;
  activePanel: CommandDockPanel;
  onSelect: (panel: PrimaryPanel) => void;
  children: ReactNode;
  indicator?: ReactNode;
};

function DockTrigger({ panel, label, activePanel, onSelect, children, indicator }: DockTriggerProps) {
  const active = activePanel === panel || (panel === "utilities" && activePanel === "account");
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={(
          <button
            type="button"
            className="command-dock__trigger"
            data-panel-trigger={panel}
            aria-label={label}
            aria-expanded={active}
            aria-controls={`command-dock-${activePanel === "account" && panel === "utilities" ? "account" : panel}`}
            data-active={active ? "" : undefined}
            onClick={() => onSelect(panel)}
          >
            {children}
            {indicator}
          </button>
        )}
      />
      <Tooltip.Portal>
        <Tooltip.Positioner className="topbar-tooltip-positioner" side="top" sideOffset={8}>
          <Tooltip.Popup className="topbar-tooltip">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function triggerPanelFor(panel: Exclude<CommandDockPanel, null>): PrimaryPanel {
  return panel === "account" ? "utilities" : panel;
}

export function CommandDock(props: CommandDockProps) {
  const {
    activePanel,
    onActivePanelChange,
    captureState,
    selectedTypes,
    sort,
    captureTriggerRef,
  } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const expanded = activePanel !== null;
  const captureLocked = activePanel === "capture" && captureState === "submitting";

  function requestPanel(nextPanel: CommandDockPanel, restoreFocus = false) {
    if (captureLocked) return;
    const previousPanel = activePanel;
    onActivePanelChange(nextPanel);
    if (!restoreFocus || previousPanel === null) return;
    const triggerPanel = triggerPanelFor(previousPanel);
    requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLButtonElement>(`[data-panel-trigger="${triggerPanel}"]`)
        ?.focus();
    });
  }

  function togglePanel(panel: PrimaryPanel) {
    requestPanel(activePanel === panel ? null : panel);
  }

  useEffect(() => {
    if (activePanel === null || activePanel === "capture") return;
    const selector = activePanel === "search"
      ? ".search-input"
      : activePanel === "account"
        ? ".command-dock__back"
        : "input, button";
    requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`#command-dock-${activePanel} ${selector}`)
        ?.focus({ preventScroll: true });
    });
  }, [activePanel]);

  useEffect(() => {
    if (!expanded || captureLocked) return;
    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest(".type-positioner") !== null) return;
      onActivePanelChange(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [captureLocked, expanded, onActivePanelChange]);

  return (
    <div
      ref={rootRef}
      className="command-dock"
      data-expanded={expanded ? "" : undefined}
      data-panel={activePanel ?? "closed"}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || activePanel === null || captureLocked) return;
        event.preventDefault();
        event.stopPropagation();
        requestPanel(activePanel === "account" ? "utilities" : null, activePanel !== "account");
      }}
    >
      <div className="command-dock__shell">
        <CommandDockPanels {...props} onRequestPanel={requestPanel} />

        <Tooltip.Provider delay={500} closeDelay={0}>
          <div className="command-dock__bar" role="group" aria-label="Library controls">
            <Tooltip.Root>
              <Tooltip.Trigger
                render={(
                  <button
                    ref={captureTriggerRef}
                    type="button"
                    className="command-dock__trigger"
                    data-panel-trigger="capture"
                    aria-label={activePanel === "capture" ? "Close capture" : "Add to inbox"}
                    aria-expanded={activePanel === "capture"}
                    aria-controls="command-dock-capture"
                    data-active={activePanel === "capture" ? "" : undefined}
                    onClick={() => togglePanel("capture")}
                  >
                    {activePanel === "capture" ? <XIcon /> : <PlusIcon />}
                  </button>
                )}
              />
              <Tooltip.Portal>
                <Tooltip.Positioner className="topbar-tooltip-positioner" side="top" sideOffset={8}>
                  <Tooltip.Popup className="topbar-tooltip">{activePanel === "capture" ? "Close" : "Add to inbox"}</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
            <DockTrigger panel="search" label="Search" activePanel={activePanel} onSelect={togglePanel}>
              <SearchIcon />
            </DockTrigger>
            <DockTrigger
              panel="filter"
              label={selectedTypes.length === 0 ? "Filter items" : `Filter items, ${selectedTypes.length} active`}
              activePanel={activePanel}
              onSelect={togglePanel}
              indicator={selectedTypes.length > 0 ? <span className="command-dock__count">{selectedTypes.length}</span> : undefined}
            >
              <FilterIcon />
            </DockTrigger>
            <DockTrigger
              panel="sort"
              label={`Sort items: ${itemSortOptionFor(sort).label}`}
              activePanel={activePanel}
              onSelect={togglePanel}
            >
              <SortIcon />
            </DockTrigger>
            <span className="command-dock__divider" aria-hidden="true" />
            <DockTrigger panel="utilities" label="Settings" activePanel={activePanel} onSelect={togglePanel}>
              <SlidersIcon />
            </DockTrigger>
          </div>
        </Tooltip.Provider>
      </div>
    </div>
  );
}
