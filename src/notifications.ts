import { requestSound, type SoundName } from "./components/ui/sound";
import { toast, type ToastState } from "./components/ui/toast-api";

type NotificationSound = Extract<SoundName, "success" | "error">;

type NotificationInput = {
  title?: string;
  message: string;
  state?: ToastState;
  sound?: NotificationSound;
};

export function notify({ title, message, state, sound }: NotificationInput) {
  toast({ title, message, state });
  if (sound !== undefined) requestSound(sound);
}
