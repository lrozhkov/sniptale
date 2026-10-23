import { windowHeaderGeometry, type WindowHeader } from '@sniptale/runtime-contracts/window-header';
type Range = readonly [number, number];

/** Fits admitted media dimensions without raster rounding; contain ignores remembered cover pan. */
export function resolveMediaFitFrame(params: {
  source: { width: number; height: number };
  output: { width: number; height: number };
  fit: 'contain' | 'cover';
  crop?: { panX: number; panY: number };
}) {
  const scale =
    params.fit === 'cover'
      ? Math.max(
          params.output.width / params.source.width,
          params.output.height / params.source.height
        )
      : Math.min(
          params.output.width / params.source.width,
          params.output.height / params.source.height
        );
  const width = params.source.width * scale;
  const height = params.source.height * scale;
  const panX = params.fit === 'cover' ? (params.crop?.panX ?? 0) : 0;
  const panY = params.fit === 'cover' ? (params.crop?.panY ?? 0) : 0;
  return {
    scale,
    width,
    height,
    x: ((params.output.width - width) * (panX + 1)) / 2,
    y: ((params.output.height - height) * (panY + 1)) / 2,
  };
}

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

interface DecoratedMediaFrameInput {
  contentWidth: number;
  contentHeight: number;
  windowHeader?: WindowHeader;
  sourceWidth: number;
  sourceHeight: number;
  frame: { x: number; y: number; width: number; height: number };
  fit: 'contain' | 'cover' | 'stretch';
  displayScale?: number;
}

/** Header rows belong to the logical window, and use the uncropped source's typography. */
export function resolveDecoratedMediaFrame(
  params: DecoratedMediaFrameInput,
  fallbackHeaderHeight = 0
) {
  const width = params.contentWidth;
  const height = params.contentHeight;
  const sourceHeaderHeight = params.windowHeader
    ? windowHeaderGeometry(params.windowHeader, {
        width: params.sourceWidth,
        height: params.sourceHeight,
      }).height
    : fallbackHeaderHeight;
  const headerRatio = sourceHeaderHeight / params.sourceWidth;
  const nominalRow = 2 * (params.displayScale ?? 1);
  // A free Native frame can be smaller than one logical header row.
  const row =
    params.fit === 'contain' && params.frame.height <= nominalRow
      ? (params.frame.height * headerRatio) / (height / width + headerRatio)
      : nominalRow;
  const headerAt = (windowWidth: number) =>
    headerRatio > 0 && row > 0 ? Math.ceil((headerRatio * windowWidth) / row - 1e-12) * row : 0;
  if (
    width <= 0 ||
    height <= 0 ||
    params.frame.width <= 0 ||
    params.frame.height <= 0 ||
    params.fit === 'stretch'
  ) {
    return {
      ...params.frame,
      headerHeight: Math.min(params.frame.height, headerAt(params.frame.width)),
    };
  }
  const contentRatio = height / width;
  let fittedWidth =
    params.fit === 'cover'
      ? Math.max(params.frame.width, params.frame.height / (contentRatio + headerRatio))
      : Math.min(params.frame.width, params.frame.height / (contentRatio + headerRatio));
  let headerHeight = headerAt(fittedWidth);
  if (params.fit !== 'cover' && fittedWidth * contentRatio + headerHeight > params.frame.height) {
    fittedWidth = Math.max(0, (params.frame.height - headerHeight) / contentRatio);
    const smallerHeader = headerAt(fittedWidth);
    if (smallerHeader < headerHeight) {
      // A discrete row boundary can leave spare height; keep the largest fitting width at that boundary.
      fittedWidth = Math.min(params.frame.width, smallerHeader / headerRatio);
      headerHeight = smallerHeader;
    }
  }
  const fittedHeight = fittedWidth * contentRatio + headerHeight;
  return {
    width: fittedWidth,
    height: fittedHeight,
    x: params.frame.x + (params.frame.width - fittedWidth) / 2,
    y: params.frame.y + (params.frame.height - fittedHeight) / 2,
    headerHeight,
  };
}
