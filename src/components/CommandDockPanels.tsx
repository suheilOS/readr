import { useState, type Ref } from "react";
import { TYPE_OPTIONS, type ItemType } from "../../shared/item";
import type { CaptureInput } from "../../shared/capture";
import { ITEM_SORT_OPTIONS, type ItemSort } from "../itemSorting";
import { AddItemForm, type AddItemFormState, type NewItemInput } from "./AddItemForm";
import { ArrowLeftIcon, CheckIcon, UserIcon } from "./icons";
import { ItemTypeIcon } from "./ItemTypeIcon";
import { SearchBar } from "./SearchBar";
import { ThemeToggle, type Theme } from "./ThemeToggle";
import { SoundToggle, useSoundMuted } from "./ui/sound";
export type CommandDockPanel = "capture" | "search" | "filter" | "sort" | "utilities" | "account" | null;

type PanelFrameProps = {
  id: Exclude<CommandDockPanel, null>;
  activePanel: CommandDockPanel;
  label: string;
  className?: string;
  children: React.ReactNode;
};

function PanelFrame({ id, activePanel, label, className = "", children }: PanelFrameProps) {
  const active = activePanel === id;
  return (
    <section
      id={`command-dock-${id}`}
      className={`command-dock__panel ${className}`.trim()}
      aria-label={label}
      aria-hidden={!active}
      inert={!active}
    >
      {children}
    </section>
  );
}

type CommandDockPanelsProps = {
  activePanel: CommandDockPanel;
  onRequestPanel: (panel: CommandDockPanel, restoreFocus?: boolean) => void;
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
  captureUrlRef?: Ref<HTMLInputElement>;
};

export function CommandDockPanels({
  activePanel,
  onRequestPanel,
  query,
  onQueryChange,
  sort,
  onSortChange,
  selectedTypes,
  onTypesChange,
  theme,
  onToggleTheme,
  onSignOut,
  onAdd,
  onCapture,
  captureState,
  captureUrlRef,
}: CommandDockPanelsProps) {
  return (
    <div className="command-dock__panels">
      <PanelFrame id="capture" activePanel={activePanel} label="Capture" className="command-dock__panel--capture">
        <div className="command-dock__panel-heading">Capture</div>
        <AddItemForm
          onAdd={onAdd}
          onCapture={onCapture}
          onCancel={() => onRequestPanel(null, true)}
          state={captureState}
          formId="capture-form"
          urlRef={captureUrlRef}
        />
      </PanelFrame>

      <PanelFrame id="search" activePanel={activePanel} label="Search" className="command-dock__panel--search">
        <SearchBar query={query} onQueryChange={onQueryChange} />
      </PanelFrame>

      <PanelFrame id="filter" activePanel={activePanel} label="Filter items">
        <FilterPanel selectedTypes={selectedTypes} onTypesChange={onTypesChange} />
      </PanelFrame>

      <PanelFrame id="sort" activePanel={activePanel} label="Sort items">
        <SortPanel
          sort={sort}
          onSortChange={(nextSort) => {
            onSortChange(nextSort);
            onRequestPanel(null, true);
          }}
        />
      </PanelFrame>

      <PanelFrame id="utilities" activePanel={activePanel} label="Settings">
        <SettingsPanel
          theme={theme}
          onToggleTheme={onToggleTheme}
          onOpenAccount={() => onRequestPanel("account")}
        />
      </PanelFrame>

      <PanelFrame id="account" activePanel={activePanel} label="Account" className="command-dock__panel--account">
        <AccountPanel
          onBack={() => onRequestPanel("utilities")}
          onSignOut={onSignOut}
        />
      </PanelFrame>
    </div>
  );
}

type FilterPanelProps = {
  selectedTypes: readonly ItemType[];
  onTypesChange: (types: ItemType[]) => void;
};

function FilterPanel({ selectedTypes, onTypesChange }: FilterPanelProps) {
  const selectedTypeSet = new Set(selectedTypes);

  function toggleType(type: ItemType, checked: boolean) {
    const next = new Set(selectedTypeSet);
    if (checked) next.add(type);
    else next.delete(type);
    onTypesChange(TYPE_OPTIONS.map((option) => option.value).filter((option) => next.has(option)));
  }

  return (
    <>
      <div className="command-dock__panel-heading">Filter by type</div>
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
                {checked ? <CheckIcon /> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      {selectedTypes.length > 0 ? (
        <div className="browse-popover__footer">
          <span className="browse-popover__summary">{selectedTypes.length} selected</span>
          <button className="browse-clear" type="button" onClick={() => onTypesChange([])}>Clear</button>
        </div>
      ) : null}
    </>
  );
}

function SortPanel({ sort, onSortChange }: { sort: ItemSort; onSortChange: (sort: ItemSort) => void }) {
  return (
    <>
      <div className="command-dock__panel-heading">Sort items</div>
      <fieldset className="browse-options">
        <legend className="visually-hidden">Sort order</legend>
        {ITEM_SORT_OPTIONS.map((option) => (
          <label className="browse-option" key={option.value}>
            <input
              type="radio"
              name="item-sort"
              value={option.value}
              checked={sort === option.value}
              onChange={() => onSortChange(option.value)}
            />
            <span className="browse-option__label">{option.label}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

function SettingsPanel({
  theme,
  onToggleTheme,
  onOpenAccount,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenAccount: () => void;
}) {
  const muted = useSoundMuted();
  return (
    <>
      <div className="command-dock__panel-heading">Settings</div>
      <div className="command-dock__utility-list">
        <div className="command-dock__utility-row">
          <span>Appearance</span>
          <span className="command-dock__utility-value">{theme === "dark" ? "Dark" : "Light"}</span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <div className="command-dock__utility-row">
          <span>Sound</span>
          <span className="command-dock__utility-value">{muted ? "Off" : "On"}</span>
          <SoundToggle className="utility-toggle sound-toggle" />
        </div>
        <button type="button" className="command-dock__account-row" onClick={onOpenAccount}>
          <UserIcon />
          <span>Account</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </>
  );
}

function AccountPanel({ onBack, onSignOut }: { onBack: () => void; onSignOut: () => void }) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Sign-out request failed with status ${response.status}`);
      onSignOut();
      window.location.reload();
    } catch {
      setError("We could not sign you out. Try again.");
      setSigningOut(false);
    }
  }

  return (
    <>
      <button type="button" className="command-dock__back" onClick={onBack}>
        <ArrowLeftIcon />
        <span>Settings</span>
      </button>
      <h2>Account</h2>
      <p>Signing out also signs you out of other Overhawl apps.</p>
      {error !== null ? <p className="command-dock__error" role="alert">{error}</p> : null}
      <p className="visually-hidden" role="status">{signingOut ? "Signing out…" : ""}</p>
      <button className="command-dock__sign-out" type="button" disabled={signingOut} onClick={() => void signOut()}>
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </>
  );
}
