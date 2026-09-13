import { toast as sonnerToast, type ExternalToast } from "sonner";
import { requestSound, type SoundName } from "./components/ui/sound";

type NotificationSound = Extract<SoundName, "success" | "error">;
type ToastState = "pending" | "success" | "warning" | "info" | "error";
type ToastAction = { label: string; run: () => void };

type NotificationInput = {
  message: string;
  state?: ToastState;
  action?: ToastAction;
  lifetime?: number;
  sound?: NotificationSound;
};

const DEFAULT_LIFETIME = 2_400;
const ACTION_LIFETIME = 6_000;

export function notify({ message, state, action, lifetime, sound }: NotificationInput): void {
  const options: ExternalToast = {
    duration: lifetime ?? (action === undefined ? DEFAULT_LIFETIME : ACTION_LIFETIME),
    action: action === undefined
      ? undefined
      : { label: action.label, onClick: () => action.run() },
  };

  switch (state) {
    case "pending":
      sonnerToast.loading(message, { ...options, duration: Infinity });
      break;
    case "success":
      sonnerToast.success(message, options);
      break;
    case "warning":
      sonnerToast.warning(message, options);
      break;
    case "info":
      sonnerToast.info(message, options);
      break;
    case "error":
      sonnerToast.error(message, options);
      break;
    default:
      sonnerToast(message, options);
      break;
  }

  if (sound !== undefined) requestSound(sound);
}
