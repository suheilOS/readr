export type ToastSide = "top" | "bottom";
export type ToastAlign = "left" | "center" | "right";
export type ToastPosition = `${ToastSide}-${ToastAlign}`;
export type ToastState = "pending" | AlertTone;
export type ToastAction = { label: string; run: () => void };
export type ToastInput = {
  id?: string;
  title?: string;
  message: string;
  state?: ToastState;
  action?: ToastAction;
  lifetime?: number;
};
export type Note = ToastInput & { id: string };

export const TOAST_EVENT = "kobra:toast";
export const TOAST_DISMISS_EVENT = "kobra:toast-dismiss";

let nextId = 0;
let toastHostReady = false;
let pendingNotes: Note[] = [];
const pendingDismissals = new Set<string>();

type AlertTone = "success" | "error" | "warning" | "info";

export function toast(input: string | ToastInput) {
  const detail = typeof input === "string" ? { message: input } : input;
  const note = { ...detail, id: detail.id ?? `toast-${++nextId}` };

  if (!toastHostReady) {
    pendingDismissals.delete(note.id);
    pendingNotes = upsertToast(pendingNotes, note);
  }

  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: note }));
}

export function dismissToast(id: string) {
  if (!toastHostReady) {
    pendingDismissals.add(id);
    pendingNotes = pendingNotes.filter((note) => note.id !== id);
  }
  window.dispatchEvent(new CustomEvent(TOAST_DISMISS_EVENT, { detail: id }));
}

export function upsertToast(notes: readonly Note[], note: Note): Note[] {
  const index = notes.findIndex((item) => item.id === note.id);
  return index === -1
    ? [note, ...notes]
    : notes.map((item, at) => (at === index ? note : item));
}

export function takePendingToasts(): Note[] {
  toastHostReady = true;
  const notes = pendingNotes.filter((note) => !pendingDismissals.has(note.id));
  pendingNotes = [];
  pendingDismissals.clear();
  return notes;
}
