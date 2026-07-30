/** Standard ease-out; matches the CSS timing used across the UI. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export interface TweenHandle {
  cancel: () => void;
}

/**
 * requestAnimationFrame tween used for canvas-side motion, where CSS
 * transitions do not apply. Honours the reduced-motion preference by jumping
 * straight to the final value.
 */
export function tween(opts: {
  duration: number;
  onUpdate: (progress: number) => void;
  onDone?: () => void;
  easing?: (t: number) => number;
}): TweenHandle {
  const easing = opts.easing ?? easeOutCubic;

  if (prefersReducedMotion() || opts.duration <= 0) {
    opts.onUpdate(1);
    opts.onDone?.();
    return { cancel: () => {} };
  }

  let frame = 0;
  let cancelled = false;
  const start = performance.now();

  const step = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / opts.duration);
    opts.onUpdate(easing(t));
    if (t < 1) frame = requestAnimationFrame(step);
    else opts.onDone?.();
  };
  frame = requestAnimationFrame(step);

  return {
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    },
  };
}
