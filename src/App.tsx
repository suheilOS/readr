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
import { SoundToggle } from "./components/SoundToggle";
import { ThemeToggle, type Theme } from "./components/ThemeToggle";
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
        <div className="reader-loading" role="status">
          Opening article…
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
  const [soundsEnabled, setSoundsEnabled] = useState(getInitialSoundEnabled);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const { readerItemId, openReaderRoute, closeReaderRoute } = useReaderRoute();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

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

  const trimmedQuery = query.trim().toLowerCase();
  const searching = trimmedQuery.length > 0;
  const {
    deskItems,
    visibleDeskItems,
    visibleInboxItems,
    visibleLibraryItems,
  } = useMemo(() => selectItemGroups(items, query), [items, query]);

  const deskFull = deskItems.length >= DESK_CAPACITY;

  async function handleAdd(input: NewItemInput) {
    if (busy) return;
    const item = await addItem(input);
    if (item === null) return;

    playCompletion();
    setLastAddedId(item.id);
    setAnnouncement(`${item.title} added to your inbox.`);
    closeCapture();
  }

  async function sendToDesk(item: Item) {
    if (deskFull) {
      setSwapCandidateId(item.id);
      return;
    }

    const movedItem = await moveToDesk(item.id);
    if (movedItem !== null) {
      setAnnouncement(`${movedItem.title} moved to your desk.`);
    }
  }

  async function sendToInbox(item: Item) {
    const movedItem = await moveToInbox(item.id);
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

    const movedItem = await swap(swapCandidateId, displaced.id);
    if (movedItem !== null) {
      playCompletion();
      setAnnouncement(`${movedItem.title} moved to your desk.`);
    }
    setSwapCandidateId(null);
  }

  async function discardItem(item: Item) {
    const discarded = await discard(item.id);
    if (!discarded) return;

    playDismissal();
    setAnnouncement(`${item.title} discarded.`);

    if (swapCandidateId === item.id) {
      setSwapCandidateId(null);
    }
  }

  async function finishItem(item: Item) {
    const finishedItem = await finish(item.id);
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
      <main className="app">
        <p className="empty-note" role="status">Loading your library…</p>
      </main>
    );
  }

  if (unauthenticated) {
    return <SignedOutState theme={theme} onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} />;
  }

  return (
    <main className="app" aria-busy={busy}>
      <h1 className="visually-hidden">readr</h1>
      <p className="visually-hidden" role="status" aria-atomic="true">
        {announcement}
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
          <DeskSection
            items={visibleDeskItems}
            mode={swapCandidateId === null ? "normal" : "swap"}
            onFinish={finishItem}
            onSendToInbox={sendToInbox}
            onDiscard={discardItem}
            onRead={openReader}
            onSelectSwapTarget={replaceDeskItem}
            onCancelSwap={() => setSwapCandidateId(null)}
          />
          {(!searching || visibleInboxItems.length > 0) && (
            <InboxSection
              items={visibleInboxItems}
              highlightId={lastAddedId}
              onSendToDesk={sendToDesk}
              onDiscard={discardItem}
            />
          )}
          {(!searching || visibleLibraryItems.length > 0) && (
            <LibrarySection
              items={visibleLibraryItems}
              onSendToDesk={sendToDesk}
              onSendToInbox={sendToInbox}
            />
          )}
        </div>
      )}
      <div className="utility-actions">
        <SoundToggle enabled={soundsEnabled} onToggle={toggleSounds} />
        <ThemeToggle
          theme={theme}
          onToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        />
      </div>
    </main>
  );
}

type SignedOutStateProps = {
  theme: Theme;
  onToggleTheme: () => void;
};

function SignedOutState({ theme, onToggleTheme }: SignedOutStateProps) {
  const authUrl = import.meta.env.VITE_AUTH_ORIGIN ?? "https://auth.overhawl.app";
  const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
  const signInUrl = `${authUrl}/?redirectTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="app signed-out-app">
      <div className="signed-out-page">
        <section className="signed-out-state" aria-labelledby="signed-out-heading">
          <h1 id="signed-out-heading" className="signed-out-heading">Sign in to Readr</h1>
          <p className="signed-out-copy">Sign in to view and manage your reading list.</p>
          <a className="signed-out-action" href={signInUrl}>Sign in</a>
        </section>
      </div>
      <div className="utility-actions">
        <ThemeToggle
          theme={theme}
          onToggle={onToggleTheme}
        />
      </div>
    </main>
  );
}
