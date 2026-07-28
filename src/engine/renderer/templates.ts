import { Graphics } from "pixi.js";
import type { PageTemplate } from "../../types";

export const PAPER_COLOR = 0xf7f3e9;
const DEFAULT_LINE_COLOR = 0xd8cfb4;

/** Ruling pitch in page units. */
const SPACING = 34;

function toColorNumber(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  const parsed = Number.parseInt(color.replace("#", ""), 16);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Draws the page background as vector geometry instead of a pre-rasterized
 * texture. Baking the ruling into a page-sized bitmap and letting the viewport
 * scale it down turns the hairlines into sub-pixel moiré — which is what made
 * the grid read as random banding rather than paper.
 *
 * `lineWidth` is in page units, so callers pass `1 / viewportScale` to keep
 * rules at roughly one screen pixel at any zoom level.
 */
export function drawTemplate(
  g: Graphics,
  template: PageTemplate,
  width: number,
  height: number,
  lineWidth: number,
): void {
  g.clear();
  g.rect(0, 0, width, height).fill(PAPER_COLOR);

  const color = toColorNumber(template.color, DEFAULT_LINE_COLOR);
  const hairline = Math.max(lineWidth, 0.25);

  switch (template.kind) {
    case "lined": {
      for (let y = SPACING * 2; y < height; y += SPACING) {
        g.moveTo(0, y);
        g.lineTo(width, y);
      }
      g.stroke({ width: hairline, color });
      break;
    }
    case "grid": {
      for (let y = SPACING; y < height; y += SPACING) {
        g.moveTo(0, y);
        g.lineTo(width, y);
      }
      for (let x = SPACING; x < width; x += SPACING) {
        g.moveTo(x, 0);
        g.lineTo(x, height);
      }
      g.stroke({ width: hairline, color });
      break;
    }
    case "dotted": {
      const radius = Math.max(hairline * 1.2, 1);
      for (let y = SPACING; y < height; y += SPACING) {
        for (let x = SPACING; x < width; x += SPACING) {
          g.circle(x, y, radius);
        }
      }
      g.fill(color);
      break;
    }
    case "graph": {
      const minor = SPACING / 2;
      for (let y = minor; y < height; y += minor) {
        g.moveTo(0, y);
        g.lineTo(width, y);
      }
      for (let x = minor; x < width; x += minor) {
        g.moveTo(x, 0);
        g.lineTo(x, height);
      }
      g.stroke({ width: hairline, color, alpha: 0.55 });

      for (let y = minor * 10; y < height; y += minor * 10) {
        g.moveTo(0, y);
        g.lineTo(width, y);
      }
      for (let x = minor * 10; x < width; x += minor * 10) {
        g.moveTo(x, 0);
        g.lineTo(x, height);
      }
      g.stroke({ width: hairline * 1.6, color });
      break;
    }
    case "blank":
    default:
      break;
  }
}
