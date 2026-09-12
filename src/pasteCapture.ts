import { parseItemUrl, type ItemUrl } from "../shared/item";

const EDITABLE_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable=\"false\"])",
  "[role=\"textbox\"]",
  "[aria-multiline=\"true\"]",
  "[data-editor]",
  "[data-rich-text-editor]",
  "[data-lexical-editor]",
  "[data-slate-editor]",
  "[data-prosemirror-editor]",
].join(", ");

export type PasteCaptureEvent = {
  clipboardData: { getData: (format: string) => string } | null;
  defaultPrevented: boolean;
  target: EventTarget | null;
};

export function readPastedUrl(event: Pick<PasteCaptureEvent, "clipboardData">): ItemUrl | null {
  const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
  if (text.length === 0 || /\s/.test(text)) return null;
  return parseItemUrl(text);
}

export function readPasteCaptureUrl(event: PasteCaptureEvent): ItemUrl | null {
  if (event.defaultPrevented || isEditablePasteTarget(event.target) || isModalPasteTarget(event.target)) {
    return null;
  }
  return readPastedUrl(event);
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_TARGET_SELECTOR) !== null;
}

export function isModalPasteTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("dialog, [role=\"dialog\"], [data-modal]") !== null;
}
