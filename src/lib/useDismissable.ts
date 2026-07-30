import { useEffect, useState } from "react";

/**
 * Keeps a panel mounted while it plays its exit animation. Without this an
 * unmount is instant and closing looks like the panel was cut off.
 */
export function useDismissable(open: boolean, duration = 200): { render: boolean; closing: boolean } {
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRender(true);
      setClosing(false);
      return;
    }
    if (!render) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      setRender(false);
      return;
    }
    setClosing(true);
    const t = window.setTimeout(() => {
      setRender(false);
      setClosing(false);
    }, duration);
    return () => window.clearTimeout(t);
    // `render` intentionally excluded: including it would restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duration]);

  return { render, closing };
}
