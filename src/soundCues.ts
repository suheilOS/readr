import { play, type SoundName } from "cuelume";

const cues = {
  completion: "success",
  dismissal: "droplet",
  error: "error",
  pageChange: "page",
  toggle: "toggle",
} satisfies Record<string, SoundName>;

export function playCompletion() {
  play(cues.completion);
}

export function playDismissal() {
  play(cues.dismissal);
}

export function playError() {
  play(cues.error);
}

export function playPageChange() {
  play(cues.pageChange);
}

export function playToggle() {
  play(cues.toggle);
}
