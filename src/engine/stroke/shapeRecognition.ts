import type { ShapeKind, StrokePoint } from "../../types";

interface Pt {
  x: number;
  y: number;
}

function perpendicularDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Ramer-Douglas-Peucker polyline simplification, used to estimate corner count. */
function simplify(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplify(points.slice(0, index + 1), epsilon);
    const right = simplify(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

/**
 * Heuristic-only shape detection (no ML): straight lines are caught by low
 * deviation from the start-end chord; closed shapes are classified as an
 * ellipse when the radius from centroid stays roughly constant, or a
 * rectangle when Douglas-Peucker simplification collapses them to ~4-5
 * corners.
 */
export function recognizeShape(rawPoints: StrokePoint[]): ShapeKind {
  if (rawPoints.length < 6) return null;
  const points: Pt[] = rawPoints.map((p) => ({ x: p.x, y: p.y }));

  const start = points[0];
  const end = points[points.length - 1];
  const chordLength = Math.hypot(end.x - start.x, end.y - start.y);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  if (diagonal < 8) return null;

  // Straight line: every point stays close to the start-end chord.
  if (chordLength > diagonal * 0.6) {
    let maxDeviation = 0;
    for (const p of points) {
      maxDeviation = Math.max(maxDeviation, perpendicularDistance(p, start, end));
    }
    if (maxDeviation < diagonal * 0.06) return "line";
  }

  const closingGap = Math.hypot(end.x - start.x, end.y - start.y);
  const isClosed = closingGap < diagonal * 0.22;
  if (!isClosed) return null;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const meanRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
  const variance = radii.reduce((a, r) => a + (r - meanRadius) ** 2, 0) / radii.length;
  const stdDev = Math.sqrt(variance);
  if (meanRadius > 0 && stdDev / meanRadius < 0.22) return "ellipse";

  const simplified = simplify(points, diagonal * 0.045);
  if (simplified.length >= 4 && simplified.length <= 6) return "rectangle";

  return null;
}

/** Produces a clean point path for a recognized shape, replacing the raw freehand input. */
export function shapeToPoints(shape: ShapeKind, rawPoints: StrokePoint[]): StrokePoint[] {
  const pressure = rawPoints.reduce((a, p) => a + p.pressure, 0) / rawPoints.length || 0.5;
  const mk = (x: number, y: number): StrokePoint => ({ x, y, pressure, tiltX: 0, tiltY: 0 });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of rawPoints) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  if (shape === "line") {
    return [mk(rawPoints[0].x, rawPoints[0].y), mk(rawPoints[rawPoints.length - 1].x, rawPoints[rawPoints.length - 1].y)];
  }
  if (shape === "rectangle") {
    return [
      mk(minX, minY),
      mk(maxX, minY),
      mk(maxX, maxY),
      mk(minX, maxY),
      mk(minX, minY),
    ];
  }
  if (shape === "ellipse") {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = (maxX - minX) / 2;
    const ry = (maxY - minY) / 2;
    const steps = 48;
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      pts.push(mk(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)));
    }
    return pts;
  }
  return rawPoints;
}
