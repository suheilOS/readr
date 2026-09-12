import { requestSound, type SoundName } from "./components/ui/sound";
import { toast, type ToastState } from "./components/ui/toast-api";

type NotificationSound = Extract<SoundName, "success" | "error">;

type NotificationInput = {
  message: string;
  state?: ToastState;
  sound?: NotificationSound;
};

export function notify({ message, state, sound }: NotificationInput) {
  toast({ message, state });
  if (sound !== undefined) requestSound(sound);
}
