export type Theme = "light" | "dark";

type ThemeToggleProps = {
  theme: Theme;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="utility-toggle theme-toggle"
      type="button"
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "dark"}
      data-cuelume-toggle=""
      onClick={onToggle}
    >
      <svg
        className="utility-toggle__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle className="theme-toggle__sun" cx="12" cy="12" r="4" />
        <path
          className="theme-toggle__sun"
          d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12h-2.1M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49M18.54 18.54l-1.49-1.49M6.95 6.95 5.46 5.46"
        />
        <path
          className="theme-toggle__moon"
          d="M20.25 14.65A8.1 8.1 0 0 1 9.35 3.75a8.7 8.7 0 1 0 10.9 10.9Z"
        />
      </svg>
    </button>
  );
}
