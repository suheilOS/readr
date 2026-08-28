(function () {
  "use strict";

  let pendingContent = null;
  let ready = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "readr-ping") {
      sendResponse({ ok: true });
      return false;
    }
    if (!isBridgeMessage(message)) return;
    pendingContent = message.content;
    deliverWhenReady();
    setTimeout(() => {
      ready = true;
      deliverWhenReady();
    }, 500);
    sendResponse({ ok: true });
    return false;
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type === "readr:capture-ready") {
      ready = true;
      deliverWhenReady();
    }
  });

  function deliverWhenReady() {
    if (!ready || pendingContent === null) return;
    const content = pendingContent;
    pendingContent = null;
    window.postMessage({ type: "readr:youtube-capture", content }, window.location.origin);
  }

  function isBridgeMessage(value) {
    return value !== null && typeof value === "object" &&
      value.type === "readr-capture" && value.content !== null && typeof value.content === "object";
  }
}());
