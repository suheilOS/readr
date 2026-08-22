import { SoundIcon } from "./icons";

type SoundToggleProps = {
  enabled: boolean;
  onToggle: () => void;
};

export function SoundToggle({ enabled, onToggle }: SoundToggleProps) {
  return (
    <button
      className="utility-toggle sound-toggle"
      type="button"
      aria-label={enabled ? "Turn sounds off" : "Turn sounds on"}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <SoundIcon className="utility-toggle__icon" />
    </button>
  );
}
