export interface AffineParams {
  pivotX: number;
  pivotY: number;
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
}

export function applyAffineToPoint(x: number, y: number, a: AffineParams): { x: number; y: number } {
  const px = (x - a.pivotX) * a.scale;
  const py = (y - a.pivotY) * a.scale;
  const cos = Math.cos(a.rotation);
  const sin = Math.sin(a.rotation);
  const rx = px * cos - py * sin;
  const ry = px * sin + py * cos;
  return { x: rx + a.pivotX + a.dx, y: ry + a.pivotY + a.dy };
}

export const IDENTITY_AFFINE: AffineParams = {
  pivotX: 0,
  pivotY: 0,
  dx: 0,
  dy: 0,
  scale: 1,
  rotation: 0,
};
