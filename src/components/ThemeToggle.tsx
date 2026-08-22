import { ThemeIcon } from "./icons";

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
      <ThemeIcon className="utility-toggle__icon" />
    </button>
  );
}
