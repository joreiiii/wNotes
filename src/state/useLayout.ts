import { useEffect, useState } from "react";

/** Below this the sidebar overlays the canvas instead of shrinking it. */
export const NARROW_BREAKPOINT = 820;
/** Below this the toolbar drops to its compact arrangement. */
export const COMPACT_BREAKPOINT = 560;

export interface LayoutInfo {
  width: number;
  height: number;
  /** Sidebar has to float over the content rather than take a column. */
  isNarrow: boolean;
  /** Very little width: toolbar scrolls, labels disappear. */
  isCompact: boolean;
  isLandscape: boolean;
}

function read(): LayoutInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    isNarrow: width < NARROW_BREAKPOINT,
    isCompact: width < COMPACT_BREAKPOINT,
    isLandscape: width > height,
  };
}

/**
 * Tracks viewport size so layout decisions that CSS alone cannot express —
 * whether the sidebar is a column or an overlay, for instance — stay in sync
 * with the media queries in App.css.
 */
export function useLayout(): LayoutInfo {
  const [info, setInfo] = useState<LayoutInfo>(read);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setInfo(read()));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return info;
}
