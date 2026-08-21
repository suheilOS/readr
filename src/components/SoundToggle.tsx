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
      data-cuelume-toggle=""
      onClick={onToggle}
    >
      <svg
        className="utility-toggle__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M11 5 6.5 9H3v6h3.5l4.5 4V5Z" />
        <path
          className="sound-toggle__enabled"
          d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.5a7.8 7.8 0 0 1 0 11"
        />
        <path
          className="sound-toggle__muted"
          d="m15.5 9.5 5 5m0-5-5 5"
        />
      </svg>
    </button>
  );
}
