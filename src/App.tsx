import { setEnabled } from "cuelume";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import {
  canReadInApp,
  DESK_CAPACITY,
  type Item,
} from "./item";
import { AddItemForm, type NewItemInput } from "./components/AddItemForm";
import { DeskSection } from "./components/DeskSection";
import { InboxSection } from "./components/InboxSection";
import { LibrarySection } from "./components/LibrarySection";
import { SearchBar } from "./components/SearchBar";
import { selectItemGroups } from "./itemSelectors";
import { useItemLibrary } from "./useItemLibrary";
import { useReaderRoute } from "./useReaderRoute";
import {
  pendingItemActionLabel,
  type PendingItemAction,
} from "./pendingItemAction";
import { ThemeToggle, type Theme } from "./components/ThemeToggle";
import { UtilityDock } from "./components/UtilityDock";
import { TwinOrbit } from "./components/TwinOrbit";
import { ArrowLeftIcon, PlusIcon } from "./components/icons";
import {
  playCompletion,
  playDismissal,
  playPageChange,
  playToggle,
} from "./soundCues";

const THEME_STORAGE_KEY = "reader:theme";
const SOUND_STORAGE_KEY = "reader:sounds";

const ReaderView = lazy(() =>
  import("./components/ReaderView").then(({ ReaderView: Component }) => ({
    default: Component,
  })),
);

function ReaderLoadingFallback({ onClose }: { onClose: () => void }) {
  return (
    <div className="reader-page">
      <header className="reader-header">
        <button type="button" className="reader-back" onClick={onClose}>
          <ArrowLeftIcon />
          <span>Back</span>
        </button>
      </header>
      <div className="reader-column">
        <div className="reader-loading">
          <TwinOrbit label="Opening article" />
          <span aria-hidden="true">Opening article…</span>
        </div>
      </div>
    </div>
  );
}

function getInitialSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function getInitialTheme(): Theme {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {
    // Fall through to the system preference.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function App() {
  const {
    items,
    loading,
    busy,
    error,
    unauthenticated,
    retry,
    addItem,
    moveToDesk,
    moveToInbox,
    finish,
    discard,
    swap,
  } = useItemLibrary();
  const [query, setQuery] = useState("");
  const [swapCandidateId, setSwapCandidateId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingItemAction, setPendingItemAction] = useState<PendingItemAction | null>(null);
  const [soundsEnabled, setSoundsEnabled] = useState(getInitialSoundEnabled);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const { readerItemId, openReaderRoute, closeReaderRoute } = useReaderRoute();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const pendingItemActionRef = useRef<PendingItemAction | null>(null);

  useEffect(() => {
    setEnabled(soundsEnabled);

    try {
      localStorage.setItem(SOUND_STORAGE_KEY, soundsEnabled ? "on" : "off");
    } catch {
      // Keep the selected sound preference for this session if storage is unavailable.
    }
  }, [soundsEnabled]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.add("theme-switching");
    void root.offsetWidth;

    const frame = requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Keep the selected theme for this session if storage is unavailable.
    }

    return () => {
      cancelAnimationFrame(frame);
      root.classList.remove("theme-switching");
    };
  }, [theme]);

  useEffect(() => {
    if (captureOpen) {
      titleInputRef.current?.focus();
    }
  }, [captureOpen]);

  useEffect(() => {
    if (swapCandidateId === null) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSwapCandidateId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [swapCandidateId]);

  const displayQuery = query.trim();
  const searching = displayQuery.length > 0;
  const {
    deskItems,
    visibleDeskItems,
    visibleInboxItems,
    visibleLibraryItems,
  } = useMemo(() => selectItemGroups(items, query), [items, query]);

  const deskFull = deskItems.length >= DESK_CAPACITY;

  async function handleAdd(input: NewItemInput): Promise<boolean> {
    if (busy) return false;
    const item = await addItem(input);
    if (item === null) return false;

    playCompletion();
    setLastAddedId(item.id);
    setAnnouncement(`${item.title} added to your inbox.`);
    closeCapture();
    return true;
  }

  async function runPendingItemAction<T>(
    action: PendingItemAction,
    operation: () => Promise<T>,
  ): Promise<T | null> {
    if (pendingItemActionRef.current !== null) return null;

    pendingItemActionRef.current = action;
    setPendingItemAction(action);
    try {
      return await operation();
    } finally {
      pendingItemActionRef.current = null;
      setPendingItemAction(null);
    }
  }

  async function sendToDesk(item: Item) {
    if (deskFull) {
      setSwapCandidateId(item.id);
      return;
    }

    const movedItem = await runPendingItemAction(
      { kind: "move-to-desk", itemId: item.id },
      () => moveToDesk(item.id),
    );
    if (movedItem !== null) {
      setAnnouncement(`${movedItem.title} moved to your desk.`);
    }
  }

  async function sendToInbox(item: Item) {
    const movedItem = await runPendingItemAction(
      { kind: "move-to-inbox", itemId: item.id },
      () => moveToInbox(item.id),
    );
    if (movedItem !== null) {
      setAnnouncement(`${movedItem.title} returned to your inbox.`);
      if (swapCandidateId === item.id) {
        setSwapCandidateId(null);
      }
    }
  }

  async function replaceDeskItem(displaced: Item) {
    if (swapCandidateId === null) {
      return;
    }

    const movedItem = await runPendingItemAction(
      { kind: "replace", itemId: displaced.id },
      () => swap(swapCandidateId, displaced.id),
    );
    if (movedItem !== null) {
      playCompletion();
      setAnnouncement(`${movedItem.title} moved to your desk.`);
    }
    setSwapCandidateId(null);
  }

  async function discardItem(item: Item) {
    const discarded = await runPendingItemAction(
      { kind: "discard", itemId: item.id },
      () => discard(item.id),
    );
    if (!discarded) return;

    playDismissal();
    setAnnouncement(`${item.title} discarded.`);

    if (swapCandidateId === item.id) {
      setSwapCandidateId(null);
    }
  }

  async function finishItem(item: Item) {
    const finishedItem = await runPendingItemAction(
      { kind: "finish", itemId: item.id },
      () => finish(item.id),
    );
    if (finishedItem !== null) {
      playCompletion();
      setAnnouncement(`${finishedItem.title} moved to your library.`);
    }
  }

  const readerItem =
    readerItemId === null
      ? null
      : items.find((item) => item.id === readerItemId) ?? null;
  const visibleItemCount =
    visibleDeskItems.length + visibleInboxItems.length + visibleLibraryItems.length;
  const searchAnnouncement = searching
    ? `${visibleItemCount} result${visibleItemCount === 1 ? "" : "s"} found.`
    : "";

  function closeCapture() {
    setCaptureOpen(false);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  }

  function openReader(item: Item) {
    if (!canReadInApp(item)) {
      return;
    }

    playPageChange();
    openReaderRoute(item.id);
  }

  const closeReader = useCallback(() => {
    playPageChange();
    closeReaderRoute();
  }, [closeReaderRoute]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function toggleSounds() {
    const nextEnabled = !soundsEnabled;

    if (nextEnabled) {
      setEnabled(true);
      playToggle();
    } else {
      playToggle();
      setEnabled(false);
    }

    setSoundsEnabled(nextEnabled);
  }

  if (loading) {
    return (
      <main className="app app-state">
        <section className="app-state__content" aria-labelledby="loading-heading">
          <h1 className="app-state__title" id="loading-heading">Readr</h1>
          <div className="app-loading">
            <TwinOrbit label="Loading your library" />
            <p className="app-state__message" aria-hidden="true">Loading your library…</p>
          </div>
        </section>
        <ThemeDock theme={theme} onToggleTheme={toggleTheme} />
      </main>
    );
  }

  if (unauthenticated) {
    return <SignedOutState theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <main className="app" aria-busy={busy}>
      <h1 className="visually-hidden">readr</h1>
      <p className="visually-hidden" role="status" aria-atomic="true">
        {announcement}
      </p>
      <p className="visually-hidden" role="status" aria-atomic="true">
        {pendingItemActionLabel(pendingItemAction)}
      </p>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {searchAnnouncement}
      </p>
      {error !== null && (
        <div className="persistence-warning" role="alert">
          <span>{error}</span>
          <button type="button" className="inline-link-button" onClick={retry}>Try again</button>
        </div>
      )}
      {readerItem !== null ? (
        <Suspense fallback={<ReaderLoadingFallback onClose={closeReader} />}>
          <ReaderView item={readerItem} onClose={closeReader} />
        </Suspense>
      ) : (
        <div className="page">
          <Collapsible.Root
            className="capture-root"
            open={captureOpen}
            onOpenChange={(open) => setCaptureOpen(open)}
          >
            <div className={`topbar${captureOpen ? " capture-open" : ""}`}>
              <div className="topbar-slot">
                <div className="search-slot" aria-hidden={captureOpen}>
                  <SearchBar query={query} onQueryChange={setQuery} />
                </div>
                <span className="capture-title" aria-hidden={!captureOpen}>
                  Capture
                </span>
              </div>
              <Collapsible.Trigger
                ref={addButtonRef}
                type="button"
                className="add-toggle"
                aria-label={captureOpen ? "Close add form" : "Add to inbox"}
                data-cuelume-toggle=""
              >
                <PlusIcon />
              </Collapsible.Trigger>
            </div>
            <Collapsible.Panel id="capture-panel" className="capture-panel" keepMounted>
              <div className="capture-clip">
                <div className="capture-content">
                  <AddItemForm
                    onAdd={handleAdd}
                    onCancel={closeCapture}
                    busy={busy}
                    formId="capture-form"
                    titleRef={titleInputRef}
                  />
                </div>
              </div>
            </Collapsible.Panel>
          </Collapsible.Root>
          {searching && visibleItemCount === 0 && swapCandidateId === null ? (
            <section className="search-empty" aria-labelledby="search-empty-heading">
              <h2 id="search-empty-heading">No results</h2>
              <p>No items match “<bdi>{displayQuery}</bdi>”. Try another search.</p>
            </section>
          ) : (
            <>
              {(!searching || visibleDeskItems.length > 0 || swapCandidateId !== null) && (
                <DeskSection
                  items={visibleDeskItems}
                  mode={swapCandidateId === null ? "normal" : "swap"}
                  onFinish={finishItem}
                  onSendToInbox={sendToInbox}
                  onDiscard={discardItem}
                  onRead={openReader}
                  onSelectSwapTarget={replaceDeskItem}
                  onCancelSwap={() => setSwapCandidateId(null)}
                  busy={busy}
                  pendingAction={pendingItemAction}
                />
              )}
              {(!searching || visibleInboxItems.length > 0) && (
                <InboxSection
                  items={visibleInboxItems}
                  highlightId={lastAddedId}
                  onSendToDesk={sendToDesk}
                  onDiscard={discardItem}
                  busy={busy}
                  pendingAction={pendingItemAction}
                />
              )}
              {(!searching || visibleLibraryItems.length > 0) && (
                <LibrarySection
                  items={visibleLibraryItems}
                  onSendToDesk={sendToDesk}
                  onSendToInbox={sendToInbox}
                  busy={busy}
                  pendingAction={pendingItemAction}
                />
              )}
            </>
          )}
        </div>
      )}
      <UtilityDock
        theme={theme}
        soundEnabled={soundsEnabled}
        onToggleSound={toggleSounds}
        onToggleTheme={toggleTheme}
      />
    </main>
  );
}

type ThemeDockProps = {
  theme: Theme;
  onToggleTheme: () => void;
};

function getAuthOrigin(): string {
  const configuredOrigin = import.meta.env.VITE_AUTH_ORIGIN;
  if (configuredOrigin !== undefined) {
    return configuredOrigin;
  }

  const host = window.location.hostname;
  if (import.meta.env.DEV || host === "localhost" || host === "127.0.0.1") {
    return `http://${host}:8788`;
  }

  return "https://auth.overhawl.app";
}

function SignedOutState({ theme, onToggleTheme }: ThemeDockProps) {
  const authUrl = getAuthOrigin();
  const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
  const signInUrl = `${authUrl}/?redirectTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="app app-state">
      <section className="app-state__content" aria-labelledby="signed-out-heading">
        <h1 id="signed-out-heading" className="app-state__title">Sign in to Readr</h1>
        <p className="app-state__message">Sign in to view and manage your reading list.</p>
        <a className="app-state__action" href={signInUrl}>Sign in</a>
      </section>
      <ThemeDock theme={theme} onToggleTheme={onToggleTheme} />
    </main>
  );
}

function ThemeDock({ theme, onToggleTheme }: ThemeDockProps) {
  return (
    <div className="utility-dock">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </div>
  );
}
