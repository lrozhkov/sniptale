interface Point {
  x: number;
  y: number;
}
interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
type Handle = 'incoming' | 'outgoing';

/** Disposable CSS-pixel targets keep clipped controls reachable without changing authored geometry. */
export function layoutCursorFocusControls(input: {
  point: Point;
  controls: Record<Handle, Point | undefined>;
  bounds: Bounds;
}): Record<Handle, Point | undefined> {
  const insetX = Math.min(14, (input.bounds.right - input.bounds.left) / 2);
  const insetY = Math.min(14, (input.bounds.bottom - input.bounds.top) / 2);
  const bounds = {
    left: input.bounds.left + insetX,
    right: input.bounds.right - insetX,
    top: input.bounds.top + insetY,
    bottom: input.bounds.bottom - insetY,
  };
  const clamp = (point: Point): Point => ({
    x: Math.max(bounds.left, Math.min(bounds.right, point.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom, point.y)),
  });
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const result = {
    incoming: input.controls.incoming ? clamp(input.controls.incoming) : undefined,
    outgoing: input.controls.outgoing ? clamp(input.controls.outgoing) : undefined,
  };
  for (const handle of ['incoming', 'outgoing'] as const) {
    const raw = input.controls[handle],
      position = result[handle];
    if (!raw || !position || distance(raw, position) < 0.000001) continue;
    const other = result[handle === 'incoming' ? 'outgoing' : 'incoming'];
    const clearance = (point: Point) =>
      Math.min(distance(point, input.point), other ? distance(point, other) : Infinity);
    if (clearance(position) >= 28) continue;
    const direction = handle === 'incoming' ? -1 : 1;
    const candidates = [
      { x: position.x, y: position.y + direction * 28 },
      { x: position.x + direction * 28, y: position.y },
      { x: position.x, y: position.y - direction * 28 },
      { x: position.x - direction * 28, y: position.y },
      { x: bounds.left, y: bounds.top },
      { x: bounds.right, y: bounds.bottom },
      { x: bounds.left, y: bounds.bottom },
      { x: bounds.right, y: bounds.top },
    ].map(clamp);
    const separated = candidates.filter((point) => clearance(point) >= 28);
    result[handle] = separated.length
      ? separated.toSorted((a, b) => distance(a, position) - distance(b, position))[0]
      : candidates.toSorted((a, b) => clearance(b) - clearance(a))[0];
  }
  return result;
}

/** Prefer a reachable handle over its key, retaining the activated handle for an equal-distance tie. */
export function resolveCursorFocusHandle(
  distances: Record<Handle, number | undefined>,
  keyDistance: number,
  preferred?: Handle
): Handle | undefined {
  const candidates = (['incoming', 'outgoing'] as const)
    .filter((name) => distances[name] !== undefined)
    .map((name) => ({ name, distance: distances[name]! }))
    .filter((item) => item.distance <= 14)
    .toSorted((a, b) => a.distance - b.distance);
  const activated = candidates.find((item) => item.name === preferred);
  return candidates[0] && candidates[0].distance < keyDistance
    ? activated && Math.abs(activated.distance - candidates[0].distance) < 0.01
      ? preferred
      : candidates[0].name
    : undefined;
}
