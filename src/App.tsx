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
  createItem,
  type Item,
} from "./item";
import { AddItemForm, type NewItemInput } from "./components/AddItemForm";
import { DeskSection } from "./components/DeskSection";
import { InboxSection } from "./components/InboxSection";
import { LibrarySection } from "./components/LibrarySection";
import { SearchBar } from "./components/SearchBar";
import { loadItems, saveItems } from "./itemStorage";
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
  const [items, setItems] = useState<Item[]>(() => loadItems([]));
  const [query, setQuery] = useState("");
  const [swapCandidateId, setSwapCandidateId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [soundsEnabled, setSoundsEnabled] = useState(getInitialSoundEnabled);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [readerItemId, setReaderItemId] = useState<string | null>(() =>
    getReaderItemId(window.location.hash),
  );
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const readTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    saveItems(items);
  }, [items]);

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
    function handleHashChange() {
      const nextReaderItemId = getReaderItemId(window.location.hash);
      setReaderItemId(nextReaderItemId);

      if (nextReaderItemId === null) {
        requestAnimationFrame(() => readTriggerRef.current?.focus());
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

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
  } = useMemo(() => {
    const nextDeskItems: Item[] = [];
    const nextVisibleDeskItems: Item[] = [];
    const nextVisibleInboxItems: Item[] = [];
    const nextVisibleLibraryItems: Item[] = [];

    for (const item of items) {
      const matches =
        trimmedQuery.length === 0 ||
        item.title.toLowerCase().includes(trimmedQuery) ||
        (item.url !== null && item.url.toLowerCase().includes(trimmedQuery));

      if (item.status === "desk") {
        nextDeskItems.push(item);
        if (matches) {
          nextVisibleDeskItems.push(item);
        }
      } else if (item.status === "inbox") {
        if (matches) {
          nextVisibleInboxItems.push(item);
        }
      } else {
        if (matches) {
          nextVisibleLibraryItems.push(item);
        }
      }
    }

    return {
      deskItems: nextDeskItems,
      visibleDeskItems: nextVisibleDeskItems,
      visibleInboxItems: nextVisibleInboxItems,
      visibleLibraryItems: nextVisibleLibraryItems,
    };
  }, [items, trimmedQuery]);

  const deskFull = deskItems.length >= DESK_CAPACITY;

  function handleAdd(input: NewItemInput) {
    const item = createItem(input);
    playCompletion();
    setItems((current) => [item, ...current]);
    setLastAddedId(item.id);
    setAnnouncement(`${item.title} added to your inbox.`);
    closeCapture();
  }

  function sendToDesk(item: Item) {
    if (deskFull) {
      setSwapCandidateId(item.id);
      return;
    }

    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, status: "desk", finishedAt: null }
          : candidate,
      ),
    );
    setAnnouncement(`${item.title} moved to your desk.`);
  }

  function sendToInbox(item: Item) {
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, status: "inbox", finishedAt: null }
          : candidate,
      ),
    );
    setAnnouncement(`${item.title} returned to your inbox.`);

    if (swapCandidateId === item.id) {
      setSwapCandidateId(null);
    }
  }

  function replaceDeskItem(displaced: Item) {
    if (swapCandidateId === null) {
      return;
    }

    setItems((current) =>
      current
        .filter((candidate) => candidate.id !== displaced.id)
        .map((candidate) =>
          candidate.id === swapCandidateId
            ? { ...candidate, status: "desk", finishedAt: null }
            : candidate,
        ),
    );
    const movedItem = items.find((candidate) => candidate.id === swapCandidateId);
    if (movedItem !== undefined) {
      playCompletion();
      setAnnouncement(`${movedItem.title} moved to your desk.`);
    }
    setSwapCandidateId(null);
  }

  function discardItem(item: Item) {
    playDismissal();
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setAnnouncement(`${item.title} discarded.`);

    if (swapCandidateId === item.id) {
      setSwapCandidateId(null);
    }
  }

  function finishItem(item: Item) {
    playCompletion();
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              status: "library",
              finishedAt: new Date().toISOString(),
            }
          : candidate,
      ),
    );
    setAnnouncement(`${item.title} moved to your library.`);
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

  function openReader(item: Item, trigger: HTMLButtonElement) {
    if (!canReadInApp(item)) {
      return;
    }

    readTriggerRef.current = trigger;
    playPageChange();
    setReaderItemId(item.id);
    window.location.hash = `read=${encodeURIComponent(item.id)}`;
  }

  const closeReader = useCallback(() => {
    playPageChange();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    setReaderItemId(null);
    requestAnimationFrame(() => readTriggerRef.current?.focus());
  }, []);

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

  return (
    <main className="app">
      <h1 className="visually-hidden">readr</h1>
      <p className="visually-hidden" role="status" aria-atomic="true">
        {announcement}
      </p>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {searchAnnouncement}
      </p>
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

function getReaderItemId(hash: string): string | null {
  if (!hash.startsWith("#read=")) {
    return null;
  }

  try {
    const itemId = decodeURIComponent(hash.slice("#read=".length));
    return itemId.length > 0 ? itemId : null;
  } catch {
    return null;
  }
}
