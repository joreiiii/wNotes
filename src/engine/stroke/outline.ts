import { getStroke } from "perfect-freehand";
import type { Stroke } from "../../types";

/** Generates the filled outline polygon for a stroke, encoding pressure as variable width. */
export function strokeToPolygon(stroke: Stroke): number[][] {
  const input = stroke.points.map((p) => [p.x, p.y, p.pressure]);
  return getStroke(input, {
    size: stroke.width,
    thinning: stroke.tool === "marker" ? 0.1 : 0.65,
    smoothing: 0.45,
    streamline: 0.45,
    simulatePressure: stroke.simulatePressure,
    last: true,
  }) as number[][];
}

export function polygonToFlat(polygon: number[][]): number[] {
  const flat = new Array(polygon.length * 2);
  for (let i = 0; i < polygon.length; i++) {
    flat[i * 2] = polygon[i][0];
    flat[i * 2 + 1] = polygon[i][1];
  }
  return flat;
}
