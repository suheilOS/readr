import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import "./UtilityDock.css";
import { SlidersIcon, UserIcon } from "./icons";
import { SoundToggle } from "./SoundToggle";
import { ThemeToggle, type Theme } from "./ThemeToggle";

type UtilityDockProps = {
  theme: Theme;
  soundEnabled: boolean;
  onToggleTheme: () => void;
  onToggleSound: () => void;
};

export function UtilityDock({
  theme,
  soundEnabled,
  onToggleTheme,
  onToggleSound,
}: UtilityDockProps) {
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    setSignOutError(null);

    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Sign-out request failed with status ${response.status}`);
      }

      window.location.reload();
    } catch {
      setSignOutError("We could not sign you out. Try again.");
      setSigningOut(false);
    }
  }

  return (
    <div
      className="utility-dock"
      role="group"
      aria-label="Account, display, and sound controls"
    >
      <Popover.Root
        onOpenChange={(open) => {
          if (open) {
            setCustomizationOpen(false);
          } else {
            setSignOutError(null);
          }
        }}
      >
        <Popover.Trigger
          className="utility-toggle account-trigger"
          type="button"
          aria-label="Account"
          data-cuelume-toggle=""
        >
          <UserIcon className="utility-toggle__icon" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className="account-popover-positioner"
            side="inline-start"
            align="end"
            sideOffset={8}
          >
            <Popover.Popup className="account-popover">
              <Popover.Title className="account-popover__title">
                Account
              </Popover.Title>
              <Popover.Description className="account-popover__description">
                Signing out also signs you out of other Overhawl apps.
              </Popover.Description>
              {signOutError !== null && (
                <p className="account-popover__error" role="alert">
                  {signOutError}
                </p>
              )}
              <p className="visually-hidden" role="status">
                {signingOut ? "Signing out…" : ""}
              </p>
              <button
                className="account-popover__action"
                type="button"
                disabled={signingOut}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root open={customizationOpen} onOpenChange={setCustomizationOpen}>
        <Popover.Trigger
          className="utility-toggle utility-launcher"
          type="button"
          aria-label={customizationOpen
            ? "Hide appearance and sound controls"
            : "Show appearance and sound controls"}
          data-cuelume-toggle=""
        >
          <SlidersIcon className="utility-toggle__icon" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className="utility-options-positioner"
            side="inline-start"
            align="end"
            sideOffset={8}
          >
            <Popover.Popup className="utility-options">
              <Popover.Title className="visually-hidden">
                Appearance and sound controls
              </Popover.Title>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
