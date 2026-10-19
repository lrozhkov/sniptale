import { windowHeaderGeometry, type WindowHeader } from '@sniptale/runtime-contracts/window-header';
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

/** Source pixels and their header form one plane before output fitting. */
export function decoratedMediaSourceSize(width: number, height: number, header?: WindowHeader) {
  return {
    width,
    height: height + (header ? windowHeaderGeometry(header, { width, height }).height : 0),
  };
}

/** Inset a canvas without collapsing either available axis below one pixel. */
export function insetMediaCanvas(output: { width: number; height: number }, padding: number) {
  const x = Math.min(padding, output.width / 2),
    y = Math.min(padding, output.height / 2);
  return {
    x,
    y,
    width: Math.max(1, output.width - 2 * x),
    height: Math.max(1, output.height - 2 * y),
  };
}

/** Measure the nearest canvas edge after rotating a decorated window about its clip pivot. */
export function mediaWindowPadding(
  output: { width: number; height: number },
  frame: { x: number; y: number; width: number; height: number },
  rotation = 0,
  pivot = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }
) {
  const radians = (rotation * Math.PI) / 180,
    c = Math.cos(radians),
    s = Math.sin(radians);
  const corners = [
    [frame.x, frame.y],
    [frame.x + frame.width, frame.y],
    [frame.x, frame.y + frame.height],
    [frame.x + frame.width, frame.y + frame.height],
  ].map(([x, y]) => ({
    x: pivot.x + (x! - pivot.x) * c - (y! - pivot.y) * s,
    y: pivot.y + (x! - pivot.x) * s + (y! - pivot.y) * c,
  }));
  return Math.max(
    0,
    Math.min(...corners.flatMap(({ x, y }) => [x, y, output.width - x, output.height - y]))
  );
}
