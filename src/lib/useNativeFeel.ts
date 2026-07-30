import { useEffect } from "react";

/**
 * Suppresses the browser behaviours that would reveal the app as web-based.
 * The CSS covers appearance; these are the ones only JS can stop.
 *
 * Components that want a context menu of their own call preventDefault in
 * their handler first — this listener is on window and runs afterwards, so it
 * only blocks the default menu, never an app menu.
 */
export function useNativeFeel(): void {
  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();
    const blockDrag = (e: DragEvent) => e.preventDefault();

    // Double-tap to zoom: swallow the second tap of a quick pair.
    let lastTouchEnd = 0;
    const blockDoubleTapZoom = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd < 320) e.preventDefault();
      lastTouchEnd = now;
    };

    // Pinch-zooming the whole UI (rather than the canvas) breaks the layout.
    const blockGesture = (e: Event) => e.preventDefault();

    // Browser shortcuts that make no sense here: find, print, reload, zoom.
    const blockShortcuts = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (["f", "p", "r", "u", "s", "g", "+", "-", "="].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };

    window.addEventListener("contextmenu", blockContextMenu);
    window.addEventListener("dragstart", blockDrag);
    window.addEventListener("drop", blockDrag);
    window.addEventListener("dragover", blockDrag);
    document.addEventListener("touchend", blockDoubleTapZoom, { passive: false });
    document.addEventListener("gesturestart", blockGesture);
    window.addEventListener("keydown", blockShortcuts);

    return () => {
      window.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("dragstart", blockDrag);
      window.removeEventListener("drop", blockDrag);
      window.removeEventListener("dragover", blockDrag);
      document.removeEventListener("touchend", blockDoubleTapZoom);
      document.removeEventListener("gesturestart", blockGesture);
      window.removeEventListener("keydown", blockShortcuts);
    };
  }, []);
}
