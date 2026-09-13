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
  type ItemStatus,
  type Item,
} from "../shared/item";
import {
  AddItemForm,
  type AddItemFormState,
  type NewItemInput,
} from "./components/AddItemForm";
import { DeskSection } from "./components/DeskSection";
import { DiscardConfirmationDialog } from "./components/DiscardConfirmationDialog";
import { InboxSection } from "./components/InboxSection";
import { LibrarySection } from "./components/LibrarySection";
import { SearchBar } from "./components/SearchBar";
import { selectItemGroups } from "./itemSelectors";
import { useItemLibrary } from "./useItemLibrary";
import { useReaderRoute } from "./useReaderRoute";
import { pendingItemActionLabel } from "./pendingItemAction";
import { focusAdjacentAction, type FocusAdjacentAction } from "./focusAdjacentAction";
import { ThemeToggle, type Theme } from "./components/ThemeToggle";
import { UtilityDock } from "./components/UtilityDock";
import { Spinner } from "./components/Spinner";
import { ArrowLeftIcon, PlusIcon } from "./components/icons";
import { notify } from "./notifications";
import type { CaptureInput } from "../shared/capture";
import { useExtensionCapture } from "./useExtensionCapture";
import { commitWithViewTransition } from "./viewTransition";
import { readPasteCaptureUrl } from "./pasteCapture";
import { useEnrichmentRefresh } from "./useEnrichmentRefresh";

const THEME_STORAGE_KEY = "reader:theme";

type AnnouncementInput = {
  title?: string;
  message: string;
  state?: "success" | "error" | "info";
  sound?: "success";
};

type DiscardRequest = {
  item: Item;
  restoreFocus: FocusAdjacentAction;
};

const loadReaderView = () =>
  import("./components/ReaderView").then(({ ReaderView: Component }) => ({
    default: Component,
  }));
const ReaderView = lazy(loadReaderView);

function preloadReaderView(): void {
  void loadReaderView();
}

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
          <Spinner label="Opening reader" />
          <span aria-hidden="true">Opening reader…</span>
        </div>
      </div>
    </div>
  );
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
    pendingAction,
    capturePending,
    error,
    unauthenticated,
    retry,
    addItem,
    captureUrlWithError,
    reconcileItem,
    reconcileItemMetadata,
    moveToDesk,
    moveToInbox,
    finish,
    discard,
    swap,
  } = useItemLibrary();
  const busy = pendingAction !== null;
  const [query, setQuery] = useState("");
  const [discardCandidate, setDiscardCandidate] = useState<Item | null>(null);
  const [swapCandidateId, setSwapCandidateId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const { readerItemId, openReaderRoute, closeReaderRoute } = useReaderRoute();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const discardRequestRef = useRef<DiscardRequest | null>(null);
  const announce = useCallback(
    ({ title, message, state, sound }: AnnouncementInput) => {
      const announcement = title === undefined ? message : `"${title}" ${message}`;
      setAnnouncement(announcement);
      notify({ message, state, sound });
    },
    [],
  );
  const closeCapture = useCallback(() => {
    setCaptureOpen(false);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  }, []);
  const { watch: watchEnrichment } = useEnrichmentRefresh(items, reconcileItemMetadata);

  const persistQuickCapture = useCallback(async (input: CaptureInput) => {
    const attempt = await captureUrlWithError(input);
    const result = attempt.result;
    if (result === null) {
      announce({
        message: attempt.error?.message ?? "That link could not be saved. Try again.",
        state: attempt.error?.code === "capture_pending" ? "info" : "error",
      });
      return attempt;
    }

    const { item, created } = result;
    if (created) {
      setLastAddedId(item.id);
      announce({
        title: item.title,
        message: "Saved to your inbox.",
        state: "success",
        sound: "success",
      });
    } else {
      announce({
        title: item.title,
        message: `Already in ${captureSectionLabel(item.status)}.`,
        state: "info",
      });
    }

    watchEnrichment(item.id);
    return attempt;
  }, [announce, captureUrlWithError, watchEnrichment]);

  const handleQuickCapture = useCallback(async (input: CaptureInput): Promise<boolean> => {
    const { result } = await persistQuickCapture(input);
    return result !== null;
  }, [persistQuickCapture]);

  const handleFormCapture = useCallback(async (input: CaptureInput): Promise<boolean> => {
    const captured = await handleQuickCapture(input);
    if (captured) closeCapture();
    return captured;
  }, [closeCapture, handleQuickCapture]);

  const cancelSwap = useCallback(() => {
    if (pendingAction !== null) return;

    setSwapCandidateId(null);
    requestAnimationFrame(() => {
      const heading = document.getElementById("desk-heading");
      if (heading?.isConnected) {
        heading.focus();
        return;
      }
      document.querySelector<HTMLButtonElement>("[data-focus-fallback]")?.focus();
    });
  }, [pendingAction]);

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
      urlInputRef.current?.focus();
    }
  }, [captureOpen]);

  useEffect(() => {
    if (swapCandidateId === null) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && pendingAction === null) {
        cancelSwap();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [swapCandidateId, pendingAction, cancelSwap]);

  useExtensionCapture({
    persistUrl: persistQuickCapture,
    reconcileItem,
  });

  useEffect(() => {
    function handlePaste(event: ClipboardEvent): void {
      if (loading || unauthenticated) return;
      const url = readPasteCaptureUrl(event);
      if (url === null) return;

      event.preventDefault();
      void handleQuickCapture({ url });
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleQuickCapture, loading, unauthenticated]);

  const displayQuery = query.trim();
  const searching = displayQuery.length > 0;
  const {
    deskItems,
    visibleDeskItems,
    visibleInboxItems,
    visibleLibraryItems,
  } = useMemo(() => selectItemGroups(items, query), [items, query]);

  const deskFull = deskItems.length >= DESK_CAPACITY;
  const addItemFormState: AddItemFormState = capturePending ? "submitting" : "idle";

  async function handleAdd(input: NewItemInput): Promise<boolean> {
    const item = await addItem(input);
    if (item === null) return false;

    setLastAddedId(item.id);
    announce({
      title: item.title,
      message: "Added to your inbox.",
      state: "success",
      sound: "success",
    });
    closeCapture();
    return true;
  }

  async function sendToDesk(item: Item): Promise<boolean> {
    if (deskFull) {
      setSwapCandidateId(item.id);
      return false;
    }

    const movedItem = await moveToDesk(item.id);
    if (movedItem !== null) {
      announce({
        title: movedItem.title,
        message: "Moved to your desk.",
        state: "success",
      });
    }
    return movedItem !== null;
  }

  async function sendToInbox(item: Item): Promise<boolean> {
    const movedItem = await moveToInbox(item.id);
    if (movedItem !== null) {
      announce({
        title: movedItem.title,
        message: "Returned to your inbox.",
        state: "success",
      });
      if (swapCandidateId === item.id) {
        setSwapCandidateId(null);
      }
    }
    return movedItem !== null;
  }

  async function replaceDeskItem(displaced: Item): Promise<boolean> {
    if (swapCandidateId === null) {
      return false;
    }

    const movedItem = await swap(swapCandidateId, displaced.id);
    if (movedItem !== null) {
      announce({
        title: movedItem.title,
        message: "Moved to your desk.",
        state: "success",
        sound: "success",
      });
      commitWithViewTransition(() => setSwapCandidateId(null));
    }
    return movedItem !== null;
  }

  function requestDiscard(item: Item, trigger: HTMLButtonElement) {
    discardRequestRef.current = {
      item,
      restoreFocus: focusAdjacentAction(
        trigger,
        item.status === "inbox" ? "inbox-heading" : "desk-heading",
      ),
    };
    setDiscardCandidate(item);
  }

  async function discardItem(item: Item): Promise<boolean> {
    const request = discardRequestRef.current?.item.id === item.id
      ? discardRequestRef.current
      : null;
    const discarded = await discard(item.id);
    if (!discarded) return false;

    announce({
      title: item.title,
      message: "Discarded.",
      state: "success",
    });

    if (request !== null) {
      request.restoreFocus();
    }
    discardRequestRef.current = null;

    if (swapCandidateId === item.id) {
      setSwapCandidateId(null);
    }
    return true;
  }

  async function finishItem(item: Item): Promise<boolean> {
    const finishedItem = await finish(item.id);
    if (finishedItem !== null) {
      announce({
        title: finishedItem.title,
        message: "Moved to your library.",
        state: "success",
        sound: "success",
      });
    }
    return finishedItem !== null;
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

  function openReader(item: Item) {
    if (!canReadInApp(item)) {
      return;
    }

    openReaderRoute(item.id);
  }

  const closeReader = useCallback(() => {
    closeReaderRoute();
  }, [closeReaderRoute]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  if (loading) {
    return (
      <main className="app app-state">
        <section className="app-state__content" aria-labelledby="loading-heading">
          <h1 className="app-state__title" id="loading-heading">Readr</h1>
          <div className="app-loading">
            <Spinner label="Loading your library" />
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
        {capturePending ? "Adding to inbox." : pendingItemActionLabel(pendingAction)}
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
                data-slot="collapsible-trigger"
                data-focus-fallback
              >
                <PlusIcon />
              </Collapsible.Trigger>
            </div>
            <Collapsible.Panel id="capture-panel" className="capture-panel" keepMounted>
              <div className="capture-clip">
                <div className="capture-content">
                  <AddItemForm
                    onAdd={handleAdd}
                    onCapture={handleFormCapture}
                    onCancel={closeCapture}
                    state={addItemFormState}
                    formId="capture-form"
                    urlRef={urlInputRef}
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
                  items={swapCandidateId === null ? visibleDeskItems : deskItems}
                  deskCount={deskItems.length}
                  mode={swapCandidateId === null ? "normal" : "swap"}
                  onFinish={finishItem}
                  onSendToInbox={sendToInbox}
                  onDiscard={requestDiscard}
                  onRead={openReader}
                  onReadIntent={preloadReaderView}
                  onSelectSwapTarget={replaceDeskItem}
                  onCancelSwap={cancelSwap}
                  pendingAction={pendingAction}
                />
              )}
              {(!searching || visibleInboxItems.length > 0) && (
                <InboxSection
                  items={visibleInboxItems}
                  highlightId={lastAddedId}
                  onSendToDesk={sendToDesk}
                  onDiscard={requestDiscard}
                  pendingAction={pendingAction}
                />
              )}
              {(!searching || visibleLibraryItems.length > 0) && (
                <LibrarySection
                  items={visibleLibraryItems}
                  onSendToDesk={sendToDesk}
                  onSendToInbox={sendToInbox}
                  pendingAction={pendingAction}
                />
              )}
            </>
          )}
        </div>
      )}
      <UtilityDock theme={theme} onToggleTheme={toggleTheme} />
      <DiscardConfirmationDialog
        item={discardCandidate}
        onCancel={() => {
          discardRequestRef.current = null;
          setDiscardCandidate(null);
        }}
        onConfirm={discardItem}
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

function captureSectionLabel(status: ItemStatus): string {
  switch (status) {
    case "inbox":
      return "your inbox";
    case "desk":
      return "your desk";
    case "library":
      return "your library";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
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
