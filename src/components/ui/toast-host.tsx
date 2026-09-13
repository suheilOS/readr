import { Toaster } from "sonner";

export function ToastHost() {
  return (
    <Toaster
      className="readr-toaster"
      position="top-center"
      gap={8}
      visibleToasts={3}
      swipeDirections={["top", "bottom", "left", "right"]}
      offset={16}
      mobileOffset={16}
      containerAriaLabel="Notifications"
      toastOptions={{
        className: "readr-toast",
        closeButton: false,
      }}
    />
  );
}
