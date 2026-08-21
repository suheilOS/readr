import { play, setEnabled } from "cuelume";
import { useEffect, useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import {
  canReadInApp,
  DESK_CAPACITY,
  createItem,
  type Item,
} from "./item";
import { AddItemForm } from "./components/AddItemForm";
import { DeskSection } from "./components/DeskSection";
import { InboxSection } from "./components/InboxSection";
import { LibrarySection } from "./components/LibrarySection";
import { ReaderView } from "./components/ReaderView";
import { SearchBar } from "./components/SearchBar";
import { loadItems, saveItems } from "./itemStorage";
import { SoundToggle } from "./components/SoundToggle";
import { ThemeToggle, type Theme } from "./components/ThemeToggle";

const THEME_STORAGE_KEY = "reader:theme";
const SOUND_STORAGE_KEY = "reader:sounds";

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

const sampleItems: Item[] = [
  {
    id: "cs-app",
    title: "Computer Systems: A Programmer’s Perspective",
    url: null,
    type: "book",
    status: "desk",
    addedAt: "2026-08-18",
    finishedAt: null,
    note: null,
  },
  {
    id: "sqlite-25",
    title: "SQLite Is 25",
    url: "https://sqlite.org",
    type: "article",
    status: "desk",
    addedAt: "2026-08-19",
    finishedAt: null,
    note: null,
  },
  {
    id: "ddia",
    title: "Designing Data-Intensive Applications",
    url: null,
    type: "book",
    status: "desk",
    addedAt: "2026-08-20",
    finishedAt: null,
    note: null,
  },
  {
    id: "simple-made-easy",
    title: "Simple Made Easy",
    url: null,
    type: "video",
    status: "inbox",
    addedAt: "2026-08-16",
    finishedAt: null,
    note: null,
  },
  {
    id: "attention-paper",
    title: "Attention Is All You Need",
    url: "https://arxiv.org",
    type: "paper",
    status: "inbox",
    addedAt: "2026-08-17",
    finishedAt: null,
    note: null,
  },
  {
    id: "doet",
    title: "The Design of Everyday Things",
    url: null,
    type: "book",
    status: "inbox",
    addedAt: "2026-08-19",
    finishedAt: null,
    note: null,
  },
  {
    id: "on-writing-well",
    title: "On Writing Well",
    url: null,
    type: "book",
    status: "inbox",
    addedAt: "2026-08-20",
    finishedAt: null,
    note: null,
  },
  {
    id: "pragprog",
    title: "The Pragmatic Programmer",
    url: null,
    type: "book",
    status: "library",
    addedAt: "2026-07-01",
    finishedAt: "2026-08-14",
    note: "Re-read the tracer bullets chapter before starting anything new.",
  },
  {
    id: "e2e-explained",
    title: "End-to-End Encryption, Explained",
    url: "https://signal.org",
    type: "article",
    status: "library",
    addedAt: "2026-07-28",
    finishedAt: "2026-08-02",
    note: null,
  },
  {
    id: "apsood",
    title: "A Philosophy of Software Design",
    url: null,
    type: "book",
    status: "library",
    addedAt: "2026-06-10",
    finishedAt: "2026-07-20",
    note: "Deep modules, shallow complexity.",
  },
];

export default function App() {
  const [items, setItems] = useState<Item[]>(() => loadItems(sampleItems));
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

  const deskItems = items.filter((item) => item.status === "desk");
  const inboxItems = items.filter((item) => item.status === "inbox");
  const libraryItems = items.filter((item) => item.status === "library");

  const deskFull = deskItems.length >= DESK_CAPACITY;
  const searching = query.trim().length > 0;

  function handleAdd(input: {
    title: string;
    url: string | null;
    type: Item["type"];
  }) {
    const item = createItem(input);
    play("success");
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
      setAnnouncement(`${movedItem.title} moved to your desk.`);
    }
    setSwapCandidateId(null);
  }

  function discardItem(item: Item) {
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setAnnouncement(`${item.title} discarded.`);

    if (swapCandidateId === item.id) {
      setSwapCandidateId(null);
    }
  }

  function finishItem(item: Item) {
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

  const trimmedQuery = query.trim().toLowerCase();

  function matches(item: Item): boolean {
    if (!searching) {
      return true;
    }

    return (
      item.title.toLowerCase().includes(trimmedQuery) ||
      (item.url !== null && item.url.toLowerCase().includes(trimmedQuery))
    );
  }

  const visibleDeskItems = deskItems.filter(matches);
  const visibleInboxItems = inboxItems.filter(matches);
  const visibleLibraryItems = libraryItems.filter(matches);
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
    setReaderItemId(item.id);
    window.location.hash = `read=${encodeURIComponent(item.id)}`;
  }

  function closeReader() {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    setReaderItemId(null);
    requestAnimationFrame(() => readTriggerRef.current?.focus());
  }

  return (
    <main className="app">
      <h1 className="visually-hidden">Reader</h1>
      <p className="visually-hidden" role="status" aria-atomic="true">
        {announcement}
      </p>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {searchAnnouncement}
      </p>
      {readerItem !== null ? (
        <ReaderView item={readerItem} onClose={closeReader} />
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
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 5v14M5 12h14" />
                </svg>
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
            swapActive={swapCandidateId !== null}
            onFinish={finishItem}
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
        <SoundToggle
          enabled={soundsEnabled}
          onToggle={() => setSoundsEnabled((current) => !current)}
        />
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
