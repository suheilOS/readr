import { describe, expect, it } from "vitest";
import { readPasteCaptureUrl, type PasteCaptureEvent } from "../../src/pasteCapture";

function pasteEvent(
  text: string,
  target: EventTarget | null = document.body,
  defaultPrevented = false,
): PasteCaptureEvent {
  return {
    clipboardData: { getData: () => text },
    defaultPrevented,
    target,
  };
}

describe("paste capture boundary", () => {
  it("accepts one valid HTTP(S) URL on the app background", () => {
    const url = readPasteCaptureUrl(pasteEvent("  https://example.com/read  "));

    expect(url).toBe("https://example.com/read");
  });

  it("ignores editable targets", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");

    expect(readPasteCaptureUrl(pasteEvent("https://example.com", input))).toBeNull();
    expect(readPasteCaptureUrl(pasteEvent("https://example.com", textarea))).toBeNull();
    expect(readPasteCaptureUrl(pasteEvent("https://example.com", editor))).toBeNull();
  });

  it("ignores select and modal targets", () => {
    const select = document.createElement("select");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");

    expect(readPasteCaptureUrl(pasteEvent("https://example.com", select))).toBeNull();
    expect(readPasteCaptureUrl(pasteEvent("https://example.com", dialog))).toBeNull();
  });

  it.each([
    "plain text",
    "https://example.com\nhttps://another.example",
    "not a url",
    "ftp://example.com/file",
    "https://user:password@example.com/private",
  ])("ignores unsupported pasted content: %s", (text) => {
    expect(readPasteCaptureUrl(pasteEvent(text))).toBeNull();
  });

  it("ignores a paste that another handler already prevented", () => {
    expect(readPasteCaptureUrl(pasteEvent("https://example.com", document.body, true))).toBeNull();
  });
});
