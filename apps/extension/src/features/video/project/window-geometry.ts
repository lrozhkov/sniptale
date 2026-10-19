type Range = readonly [number, number];

/** Clamp a logical radius to the visible decorated window. */
export function roundedWindowRadius(width: number, height: number, radius: number): number {
  return Math.max(0, Math.min(radius, width / 2, height / 2));
}

/** Signed interior clearance bounds for every point in an axis-aligned interval. */
export function roundedWindowClearance(
  x: Range,
  y: Range,
  width: number,
  height: number,
  cornerRadius: number
) {
  const radius = roundedWindowRadius(width, height, cornerRadius);
  const absolute = (value: Range, center: number): Range => {
    const shifted: Range = [value[0] - center, value[1] - center];
    return [
      shifted[0] <= 0 && shifted[1] >= 0 ? 0 : Math.min(Math.abs(shifted[0]), Math.abs(shifted[1])),
      Math.max(Math.abs(shifted[0]), Math.abs(shifted[1])),
    ];
  };
  const ax = absolute(x, width / 2),
    ay = absolute(y, height / 2);
  const distance = (dx: number, dy: number) =>
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
  return {
    low: -distance(ax[1] - width / 2 + radius, ay[1] - height / 2 + radius),
    high: -distance(ax[0] - width / 2 + radius, ay[0] - height / 2 + radius),
  };
}
