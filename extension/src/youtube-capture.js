import { captureCurrentVideo } from "./youtube-capture-core";

// executeScript may inject this file more than once on a long-lived YouTube SPA.
// Keep one listener per isolated world so a capture gets one response.
if (globalThis.__readrYoutubeCaptureInstalled !== true) {
  globalThis.__readrYoutubeCaptureInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isCaptureRequest(message)) return false;

    const expectedVideoId = message.expectedVideoId;
    void captureCurrentVideo({
      document,
      url: window.location.href,
      expectedVideoId,
    })
      .then((content) => sendResponse({ ok: true, content }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "The YouTube media could not be read.",
      }));
    return true;
  });
}

function isCaptureRequest(value) {
  return value !== null && typeof value === "object" &&
    value.type === "capture-youtube-media" &&
    typeof value.expectedVideoId === "string" &&
    /^[A-Za-z0-9_-]{11}$/.test(value.expectedVideoId);
}
