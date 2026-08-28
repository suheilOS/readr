import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const popupHtml = readFileSync(resolve(process.cwd(), "extension/popup.html"), "utf8");
const popupScript = readFileSync(resolve(process.cwd(), "extension/popup.js"), "utf8");

describe("Readr extension popup", () => {
  it("keeps a stable width in Chrome's popup sizing pass", () => {
    const popup = loadPopup();

    expect(popup.dom.window.getComputedStyle(popup.dom.window.document.body).width).toBe("320px");
    expect(popup.dom.window.getComputedStyle(popup.dom.window.document.body).maxWidth).toBe("none");
  });

  it("shows capture stages and a success acknowledgement", () => {
    const popup = loadPopup();
    popup.button.click();

    expect(popup.button.disabled).toBe(true);
    expect(popup.button.getAttribute("aria-busy")).toBe("true");
    expect(popup.status.dataset.state).toBe("busy");
    expect(popup.statusText.textContent).toBe("Reading transcript…");

    popup.progressListener?.({ type: "capture-progress", stage: "opening" });
    expect(popup.statusText.textContent).toBe("Opening Readr…");

    popup.responseCallback?.({ ok: true });
    expect(popup.button.disabled).toBe(false);
    expect(popup.button.getAttribute("aria-busy")).toBe("false");
    expect(popup.status.dataset.state).toBe("success");
    expect(popup.statusText.textContent).toBe("Captured to Readr.");
  });

  it("shows a returned capture error and restores the button", () => {
    const popup = loadPopup();
    popup.button.click();
    popup.responseCallback?.({ ok: false, error: "Sign in to use Readr." });

    expect(popup.button.disabled).toBe(false);
    expect(popup.status.dataset.state).toBe("error");
    expect(popup.statusText.textContent).toBe("Sign in to use Readr.");
  });

  it("shows a runtime messaging error", () => {
    const popup = loadPopup();
    popup.button.click();
    popup.lastError = { message: "The capture service is unavailable." };
    popup.responseCallback?.(undefined);

    expect(popup.status.dataset.state).toBe("error");
    expect(popup.statusText.textContent).toBe("The capture service is unavailable.");
  });
});

type ProgressMessage = { type: string; stage: string };
type Popup = {
  dom: JSDOM;
  button: HTMLButtonElement;
  status: HTMLElement;
  statusText: HTMLElement;
  progressListener?: (message: ProgressMessage) => void;
  responseCallback?: (response: unknown) => void;
  lastError?: { message: string };
};

function loadPopup(): Popup {
  const dom = new JSDOM(popupHtml, { runScripts: "outside-only" });
  let progressListener: ((message: ProgressMessage) => void) | undefined;
  let responseCallback: ((response: unknown) => void) | undefined;
  const runtime = {
    lastError: undefined as { message: string } | undefined,
    onMessage: {
      addListener: (listener: (message: ProgressMessage) => void) => {
        progressListener = listener;
      },
    },
    sendMessage: (_message: unknown, callback: (response: unknown) => void) => {
      responseCallback = callback;
    },
  };
  Object.defineProperty(dom.window, "chrome", {
    value: { runtime },
  });
  dom.window.eval(popupScript);

  const button = dom.window.document.querySelector<HTMLButtonElement>("#capture");
  const status = dom.window.document.querySelector<HTMLElement>("#status");
  const statusText = dom.window.document.querySelector<HTMLElement>("#status-text");
  if (button === null || status === null || statusText === null) {
    throw new Error("Popup controls were not found.");
  }

  return {
    dom,
    button,
    status,
    statusText,
    get progressListener() { return progressListener; },
    get responseCallback() { return responseCallback; },
    get lastError() { return runtime.lastError; },
    set lastError(value) { runtime.lastError = value; },
  };
}
