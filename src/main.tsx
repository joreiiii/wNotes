import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

/**
 * PixiJS measures text through the canvas API, which silently falls back to a
 * system face if the webfont has not loaded yet — and already-drawn text is not
 * re-measured afterwards. Waiting for the face keeps canvas and DOM type
 * consistent. Failures are non-fatal: the app renders with the fallback.
 */
async function waitForFont(): Promise<void> {
  if (!document.fonts?.load) return;
  try {
    await Promise.race([
      Promise.all([document.fonts.load('400 16px "Outfit"'), document.fonts.load('600 16px "Outfit"')]),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
  } catch {
    // Rendering with the fallback face beats not rendering at all.
  }
}

waitForFont().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
