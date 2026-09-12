import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/open-runde/400.css";
import "@fontsource/open-runde/500.css";
import "@fontsource/open-runde/600.css";
import "@fontsource/open-runde/700.css";
import "./styles.css";
import "./reader/reader.css";
import App from "./App";
import { migrateSoundPreference, SoundEffects } from "./components/ui/sound";
import { ToastHost } from "./components/ui/toast-host";

migrateSoundPreference();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element.");
}

createRoot(root).render(
  <StrictMode>
    <SoundEffects>
      <App />
      <ToastHost />
    </SoundEffects>
  </StrictMode>,
);
