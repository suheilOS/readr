# Project brief: Reader

Reader is an Overhawl product for intentional consumption. You capture things worth reading or watching, choose a few that deserve attention now, finish them, and keep a quiet record of what you completed. This brief defines the philosophy, the data model, the reader architecture, and the phased delivery plan.

## Why read-later tools fail

Most read-later apps optimize for saving. You save an article, feel done, and accumulate hundreds of unread items. Saving resolves guilt instead of allocating attention, so the queue becomes a graveyard.

Reader rejects that model. Capturing an item means committing future attention, not archiving a URL. Deciding something is not worth reading is a successful outcome here, not a failure.

## Product principle: the desk is the budget

A physical desk holds a handful of papers. Reader copies that constraint instead of configuring around it:

- **Fixed capacity**: the desk holds 5 items, hardcoded
- **Forced decisions**: a full desk blocks new items until you finish one, discard one, or swap one out
- **Terminal swaps**: swapping discards the displaced item outright; nothing returns to the inbox

The constraint replaces configuration. No setting changes these rules.

## Lifecycle

Every item sits in exactly one state at any time:

1. **Inbox**: captured but undecided
2. **Desk**: deliberately chosen for current attention
3. **Library**: finished and retained as a record
4. **Discarded**: deleted immediately, from any state

Discard removes the item permanently. The library answers one question: what have I finished?

## Capture always lands in the inbox

You capture fast and decide later. Adding never blocks on a decision, and deciding never interrupts capture. The separation keeps both actions honest: the inbox holds everything, the desk commits to five.

## Items and metadata

Metadata entry is fully manual. Paste a URL, type a title, optionally name a source, pick a type. Capture makes zero network calls.

```ts
type ItemType = "article" | "book" | "paper" | "video" | "podcast";
type ItemStatus = "inbox" | "desk" | "library";

type Item = {
  id: string;
  title: string;
  source: string | null;
  url: string | null;
  type: ItemType;
  status: ItemStatus;
  addedAt: string;
  finishedAt: string | null;
  note: string | null;
};
```

The type appears quietly on cards, as “Book” or “Article”. Books, films, podcasts, and videos stay external: Reader manages the intention, not the media.

Reading time is not stored. It is computed when you open an item in the reader, from extracted word count.

## The four verbs

Version 1 succeeds if four interactions feel satisfying:

1. **Add**: paste a URL or type a title into the inbox
2. **Decide**: move inbox items onto the desk, or discard them
3. **Finish**: move desk items to the library
4. **Retrieve**: search across title and source

If these feel flat, no amount of metadata scraping rescues the product.

## In-app reader scope

Articles and papers open inside the app through a distraction-free view. A Worker route does the extraction:

1. `POST /api/extract` receives a URL
2. The Worker strips tracking parameters, blocks private-network addresses, then fetches server side
3. Defuddle (node bundle) with linkedom extracts main content, title, author, and word count
4. The client sanitizes returned HTML with DOMPurify before rendering

Extraction failures fall back to an Open original link. Version 1 ships no per-site selector overrides.

Typography is the entire reading interface: measure, line height, hierarchy. No floating settings bars, font pickers, or outlines.

## What the library shows

The library stays deliberately weak. No collections, tags, ratings, reviews, highlights, streaks, or statistics will be added. Search over titles and sources handles retrieval.

Opening a finished item shows its metadata, its finish date, and one optional note. Nothing else.

## Future seams

Finished-item screens reserve space for a Write about this action that would open a calmd document. Design for the seam now; build it elsewhere, never here.

## Interface structure

One screen carries the product. No sidebar, no dashboard:

```text
READING

On your desk                     3 / 5

┌───────────────────────────────┐
│ Computer Systems              │
│ Bryant & O’Hallaron · Book    │
└───────────────────────────────┘
┌───────────────────────────────┐
│ SQLite Is Reimagined          │
│ example.com · Article         │
└───────────────────────────────┘

Inbox 7                 Library 42
```

Desk cards show title, source, type, and a Read action for supported URLs. The inbox collapses to a count until opened. Three interaction principles apply everywhere:

- **Capture fast**: focus the add control, type, press Enter
- **Decide deliberately**: moving an item onto the full desk carries visible weight
- **Finish satisfyingly**: completion gets a brief transition and sound, never a delay

Mobile stacks the same layout with the desk first. Every control stays reachable without hover.

## Visual direction and sound

Open Runde loads locally as the primary typeface. Prefer generous whitespace, soft neutral surfaces, minimal borders, rounded controls, calm transitions, and system-aware dark and light themes. Avoid dashboard aesthetics, dense metadata, and decoration without function.

Synthesized Web Audio feedback marks add, move, finish, and discard. Sounds follow the house style established in Horizons: generated at runtime, zero audio files.

## Persistence

All data lives in browser localStorage behind a versioned schema. Parsing validates every stored field and migrates older shapes on load, following the storage pattern from Horizons. Storage access stays isolated from presentation so the persistence layer can be replaced later.

Data belongs to the page origin that created it. Choose the production custom domain before entering anything you intend to keep.

## Explicitly out of scope

Version 1 excludes the following unless this brief is revised first:

- tags, collections, shelves
- ratings, reviews, highlights, annotations
- reading statistics, goals, streaks, challenges
- recommendation feeds, social features
- accounts, authentication, cloud sync
- browser extension
- PDF upload or storage
- per-site extraction overrides
- configurable desk capacity, multiple desks

## Technology stack

- React 19 + TypeScript + Vite, built with Bun
- Vanilla CSS, no framework
- Cloudflare Workers static assets plus one function route for extraction
- Dependencies limited to react, react-dom, @fontsource/open-runde, defuddle, linkedom, dompurify

Interface minimalism does not demand architectural austerity. The Worker exists because reading is core functionality, not complexity.

## Phased delivery

Implement in small phases, one narrow goal each:

0. **Foundation**: scaffold Vite + React, wrangler config, fonts, base styles
1. **Static interface**: complete single-screen layout without behavior
2. **Core interactions**: add, decide, finish, swap-discard, search, in memory only
3. **Persistence**: localStorage schema, field validation, migration
4. **Reader**: extraction Worker route and distraction-free view
5. **Responsive pass**: mobile refinement across screen sizes
6. **Polish**: sounds, themes, accessibility, empty states

Validate each phase with `bun run build`, `bun run lint`, and manual inspection before moving on.

## Definition of done

Version 1 is complete when:

- the desk caps at 5 and enforces swap-discard correctly
- capture, decide, finish, discard, and search work offline
- valid items persist across reloads
- articles and papers open in the reader with clean typography
- extraction failures fall back to the original link
- books, films, podcasts, and videos manage as intentions only
- the flow works well on desktop and mobile

It should feel finished because it does so little.
