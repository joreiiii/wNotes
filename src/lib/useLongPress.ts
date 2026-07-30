import { useCallback, useRef } from "react";

const HOLD_MS = 480;
/** Movement beyond this cancels the hold — the user is scrolling, not pressing. */
const MOVE_TOLERANCE = 10;

/**
 * Long-press handler for touch, where right-click is unavailable. Fires once and
 * suppresses the click that would otherwise follow, so a hold opens a menu
 * instead of activating the item.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return; // right-click covers this case
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLongPress();
      }, HOLD_MS);
    },
    [onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!origin.current) return;
      if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > MOVE_TOLERANCE) clear();
    },
    [clear],
  );

  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
    [],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClickCapture,
  };
}
