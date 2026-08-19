import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Long-lived port so the service worker can detect popup close. Chrome tears
// this down the moment the popup document is destroyed (loses focus, Esc,
// etc.), firing port.onDisconnect in the SW — that's the trigger for the
// SECURE_MODE deferred-sync flow. Parked on window so the reference outlives
// this module scope and isn't GC'd for the popup's lifetime.
(window as unknown as { __tvPopupPort?: chrome.runtime.Port }).__tvPopupPort =
  chrome.runtime.connect({ name: "popup" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
