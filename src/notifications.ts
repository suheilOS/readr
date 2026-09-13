import { createElement, type ReactNode } from "react";
import { toast as sonnerToast, type ExternalToast } from "sonner";
import { requestSound, type SoundName } from "./components/ui/sound";

type NotificationSound = Extract<SoundName, "success" | "error">;
type ToastState = "pending" | "success" | "warning" | "info" | "error";
type ToastAction = { label: string; run: () => void };

type NotificationInput = {
  title?: string;
  message: string;
  state?: ToastState;
  action?: ToastAction;
  lifetime?: number;
  sound?: NotificationSound;
};

const DEFAULT_LIFETIME = 2_400;
const ACTION_LIFETIME = 6_000;

export function notify({ title, message, state, action, lifetime, sound }: NotificationInput): void {
  const content: ReactNode = title === undefined
    ? message
    : createElement(
      "span",
      null,
      createElement("strong", { className: "font-semibold" }, `"${title}"`),
      ` ${message}`,
    );
  const options: ExternalToast = {
    duration: lifetime ?? (action === undefined ? DEFAULT_LIFETIME : ACTION_LIFETIME),
    action: action === undefined
      ? undefined
      : { label: action.label, onClick: () => action.run() },
  };

  switch (state) {
    case "pending":
      sonnerToast.loading(content, { ...options, duration: Infinity });
      break;
    case "success":
      sonnerToast.success(content, options);
      break;
    case "warning":
      sonnerToast.warning(content, options);
      break;
    case "info":
      sonnerToast.info(content, options);
      break;
    case "error":
      sonnerToast.error(content, options);
      break;
    default:
      sonnerToast(content, options);
      break;
  }

  if (sound !== undefined) requestSound(sound);
}
