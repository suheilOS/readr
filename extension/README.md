# Readr browser capture (Chrome MV3)

This unpacked extension is the first Phase 12 vertical slice. It captures a transcript that is already visible in a YouTube watch page and sends structured data to an open, signed-in Readr tab. It does not read cookies, fetch arbitrary URLs, or load remote code.

## Development smoke test

1. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select this `extension/` directory.
3. Sign in to [Readr](https://readr.overhawl.app/) in a tab.
4. Open a YouTube watch page, open **Show transcript**, and wait for segments to render.
5. Use the extension action and choose **Capture current video**.
6. Open the matching item in Readr. Its stored metadata and transcript should render without waiting for server-side YouTube extraction.

The local host patterns in `manifest.json` cover the Vite and Cloudflare preview origins used by this repository. The extension is intentionally not wired into the app build; Chrome packages these reviewable files directly under Manifest V3.
