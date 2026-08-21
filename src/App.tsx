import { useEffect, useState } from "react";
import type { Item } from "./item";
import { DeskSection } from "./components/DeskSection";
import { InboxSection } from "./components/InboxSection";
import { LibrarySection } from "./components/LibrarySection";
import { ThemeToggle, type Theme } from "./components/ThemeToggle";

const THEME_STORAGE_KEY = "reader:theme";

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
    source: "Bryant & O’Hallaron",
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
    source: "sqlite.org",
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
    source: "Martin Kleppmann",
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
    source: "Rich Hickey · InfoQ",
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
    source: "arxiv.org",
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
    source: "Don Norman",
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
    source: "William Zinsser",
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
    source: "Hunt & Thomas",
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
    source: "signal.org",
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
    source: "John Ousterhout",
    url: null,
    type: "book",
    status: "library",
    addedAt: "2026-06-10",
    finishedAt: "2026-07-20",
    note: "Deep modules, shallow complexity.",
  },
];

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Keep the selected theme for this session if storage is unavailable.
    }
  }, [theme]);

  const deskItems = sampleItems.filter((item) => item.status === "desk");
  const inboxItems = sampleItems.filter((item) => item.status === "inbox");
  const libraryItems = sampleItems.filter((item) => item.status === "library");

  return (
    <main className="app">
      <h1 className="visually-hidden">Reader</h1>
      <div className="page">
        <DeskSection items={deskItems} />
        <InboxSection items={inboxItems} />
        <LibrarySection items={libraryItems} />
      </div>
      <ThemeToggle
        theme={theme}
        onToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />
    </main>
  );
}
