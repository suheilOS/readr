(function () {
  "use strict";

  let pendingContent = null;
  let ready = false;
  let readinessTimer = null;
  let captureTimer = null;
  let pendingResponse = null;

  const READINESS_TIMEOUT_MS = 10_000;
  const CAPTURE_TIMEOUT_MS = 20_000;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "readr-ping") {
      sendResponse({ ok: true });
      return false;
    }
    if (!isBridgeMessage(message)) return;

    if (pendingResponse !== null) {
      finishCapture({ ok: false, error: "A video capture is already in progress." });
    }
    pendingContent = {
      captureId: message.captureId,
      content: message.content,
      delivered: false,
    };
    pendingResponse = sendResponse;
    scheduleReadinessFallback();
    captureTimer = setTimeout(() => {
      finishCapture({ ok: false, error: "Readr did not finish saving the video." });
    }, CAPTURE_TIMEOUT_MS);
    deliverWhenReady();
    return true;
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type === "readr:capture-ready") {
      ready = true;
      clearReadinessFallback();
      deliverWhenReady();
      return;
    }
    if (isCaptureResult(event.data)) {
      if (pendingContent === null || event.data.captureId !== pendingContent.captureId) return;
      finishCapture({
        ok: event.data.ok,
        ...(event.data.ok ? {} : { error: event.data.error }),
      });
    }
  });

  function deliverWhenReady() {
    if (!ready || pendingContent === null || pendingContent.delivered) return;
    pendingContent.delivered = true;
    window.postMessage({
      type: "readr:youtube-capture",
      captureId: pendingContent.captureId,
      content: pendingContent.content,
    }, window.location.origin);
  }

  function scheduleReadinessFallback() {
    if (readinessTimer !== null) return;
    readinessTimer = setTimeout(() => {
      readinessTimer = null;
      ready = true;
      deliverWhenReady();
    }, READINESS_TIMEOUT_MS);
  }

  function clearReadinessFallback() {
    if (readinessTimer === null) return;
    clearTimeout(readinessTimer);
    readinessTimer = null;
  }

  function finishCapture(response) {
    if (captureTimer !== null) {
      clearTimeout(captureTimer);
      captureTimer = null;
    }
    clearReadinessFallback();
    pendingContent = null;
    const respond = pendingResponse;
    pendingResponse = null;
    respond?.(response);
  }

  function isBridgeMessage(value) {
    return value !== null && typeof value === "object" &&
      value.type === "readr-capture" && isCaptureId(value.captureId) &&
      value.content !== null && typeof value.content === "object";
  }

  function isCaptureResult(value) {
    return value !== null && typeof value === "object" &&
      value.type === "readr:capture-result" && isCaptureId(value.captureId) &&
      (value.ok === true || (value.ok === false && typeof value.error === "string"));
  }

  function isCaptureId(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 100;
  }
}());
