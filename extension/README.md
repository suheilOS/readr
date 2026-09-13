# Readr browser capture (Chrome MV3)

The extension is a one-click capture surface. It has no popup or capture form:
clicking the action saves the active HTTP(S) tab to Readr and shows a native
browser notification.

YouTube URLs follow the same URL-first path. After `/api/capture` returns the
authoritative item, the default browser export from the pinned Defuddle
`0.19.2` package (the `defuddle` entry, not `defuddle/full`) runs its async
YouTube extractor against the live YouTube document and best-effort attaches
transcript, chapter, and media metadata to that item. The transcript panel is
not required. The extension build includes this export locally; it does not
load a CDN or remote script. A missing transcript never undoes a successful URL capture.

## Build and load unpacked

Build the reviewable MV3 package from the repository root:

```sh
bun run build:extension
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose
**Load unpacked**, and select `extension/dist/`. Re-run the build after source
changes and reload the extension from that page.

The extension uses `activeTab` for the clicked page, explicit YouTube host
access for the live-page content script, explicit Readr origins for the bridge,
and the `notifications` permission. It never reads, copies, or stores Readr
session cookies or auth tokens.

A signed-in Readr tab is reused without activation or navigation. If one does
not exist, the extension opens a background Readr tab for the bridge and closes
it after the capture/enrichment attempt. When authentication is required, that
tab is kept and focused so sign-in can be completed.
