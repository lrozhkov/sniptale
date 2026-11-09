/** Conservative local geometry. Null denotes a native operation that is known to do nothing. */
interface PrimitiveBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type PrimitiveGeometry = PrimitiveBounds | null | undefined;
type PrimitiveTransform = readonly [number, number, number, number, number, number];

/** Include complete control hulls rather than sampling curves or discarding overflow. */
export function primitivePointBounds(
  points: readonly { x: number; y: number }[]
): PrimitiveBounds | undefined {
  if (!points.length || points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y)))
    return undefined;
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of points) {
    x = Math.min(x, p.x);
    y = Math.min(y, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }
  return { x, y, width: right - x, height: bottom - y };
}

/** Transform an expanded local rectangle, retaining outward integer pixels and the effect halo. */
export function primitiveRasterRegion(
  bounds: PrimitiveGeometry,
  transform: PrimitiveTransform,
  surface: { width: number; height: number },
  halo: number,
  stroke = 0
): PrimitiveBounds {
  const full = { x: 0, y: 0, width: surface.width, height: surface.height };
  if (!bounds) return full;
  const x1 = Math.min(bounds.x, bounds.x + bounds.width) - stroke;
  const y1 = Math.min(bounds.y, bounds.y + bounds.height) - stroke;
  const x2 = Math.max(bounds.x, bounds.x + bounds.width) + stroke;
  const y2 = Math.max(bounds.y, bounds.y + bounds.height) + stroke;
  const [a, b, c, d, e, f] = transform;
  const physical = primitivePointBounds(
    [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x1, y: y2 },
      { x: x2, y: y2 },
    ].map((p) => ({ x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }))
  );
  if (!physical || !Number.isFinite(halo)) return full;
  const left = Math.max(0, Math.floor(physical.x - halo));
  const top = Math.max(0, Math.floor(physical.y - halo));
  const right = Math.min(surface.width, Math.ceil(physical.x + physical.width + halo));
  const bottom = Math.min(surface.height, Math.ceil(physical.y + physical.height + halo));
  // A transparent operand still matters for destination-in, even when all ink is offscreen.
  if (right <= left || bottom <= top) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: left, y: top, width: right - left, height: bottom - top };
}
