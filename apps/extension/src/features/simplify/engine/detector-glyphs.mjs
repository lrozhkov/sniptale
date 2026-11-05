import { orderStatistic } from './order-statistic.mjs';
import { detachTextUnderlines } from './structure.mjs';
const CARDINAL_LEFT = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
function createGlyphMask(image, box, luminance, factor) {
  const pixels = image.data,
    stride = image.width;
  const inkContrast = (i) =>
    luminance
      ? Math.abs(box.bg[0] - pixels[i]) * 0.2126 +
        Math.abs(box.bg[1] - pixels[i + 1]) * 0.7152 +
        Math.abs(box.bg[2] - pixels[i + 2]) * 0.0722
      : Math.max(
          Math.abs(box.bg[0] - pixels[i]),
          Math.abs(box.bg[1] - pixels[i + 1]),
          Math.abs(box.bg[2] - pixels[i + 2])
        );
  const width = Math.floor(box.w),
    height = Math.floor(box.h),
    mask = new Uint8Array(width * height),
    byteContrast = box.bg.every((v) => Number.isInteger(v) && v >= 0 && v <= 255),
    foreground = byteContrast ? new Uint32Array(256) : [];
  let foregroundLength = 0;
  let peak = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = ((box.y + y) * stride + box.x + x) * 4;
      peak = Math.max(peak, inkContrast(i));
    }
  const threshold = Math.max(12, Math.min(80, peak * factor));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = ((box.y + y) * stride + box.x + x) * 4;
      const contrast = inkContrast(i);
      if (contrast > threshold) {
        mask[y * width + x] = 1;
        foregroundLength++;
        const value = Math.max(
          Math.abs(box.bg[0] - pixels[i]),
          Math.abs(box.bg[1] - pixels[i + 1]),
          Math.abs(box.bg[2] - pixels[i + 2])
        );
        if (byteContrast) foreground[value]++;
        else foreground.push(value);
      }
    }
  return { width, height, mask, byteContrast, foreground, foregroundLength };
}
function floodGlyphComponent(mask, width, height, k) {
  const queue = [k];
  mask[k] = 2;
  let left = width,
    right = 0,
    top = height,
    bottom = 0,
    perimeter = 0;
  for (let n = 0; n < queue.length; n++) {
    const p = queue[n],
      x = p % width,
      y = Math.floor(p / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    for (const [dx, dy] of CARDINAL_LEFT) {
      const xx = x + dx,
        yy = y + dy,
        j = yy * width + xx;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height || !mask[j]) {
        perimeter++;
        continue;
      }
      if (mask[j] === 1) {
        mask[j] = 2;
        queue.push(j);
      }
    }
  }
  return { queue, left, right, top, bottom, perimeter };
}
function measureGlyphPiece(group, width, componentId) {
  if (!group.length) return null;
  const xs = group.map((p) => p % width),
    ys = group.map((p) => Math.floor(p / width)),
    x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys),
    owned = new Set(group);
  let edge = 0;
  for (const p of group)
    for (const [dx, dy] of CARDINAL_LEFT) if (!owned.has(p + dy * width + dx)) edge++;
  return {
    x: x0,
    y: y0,
    h: y1 - y0 + 1,
    w: x1 - x0 + 1,
    bottom: y1,
    stroke: (2 * group.length) / Math.max(1, edge),
    n: group.length,
    componentId,
  };
}
function splitGlyphBridge(queue, width, bounds, componentId) {
  const { left, w, h } = bounds;
  if (h >= 8 && w > h * 1.2 && w < h * 2.5) {
    const counts = Array(w).fill(0);
    for (const p of queue) counts[(p % width) - left]++;
    const cuts = counts
      .map((n, x) => ({ n, x }))
      .filter((p) => p.x >= h * 0.3 && w - p.x >= h * 0.3 && p.n > 0 && p.n <= h * 0.15)
      .sort((a, b) => a.n - b.n || Math.abs(a.x - w / 2) - Math.abs(b.x - w / 2));
    let pieces = null;
    for (const cut of cuts) {
      const groups = [
        queue.filter((p) => p % width < left + cut.x),
        queue.filter((p) => p % width > left + cut.x),
      ];
      const measured = groups.map((group) => measureGlyphPiece(group, width, componentId));
      if (
        measured.every((p) => p && p.h >= h * 0.8 && p.w <= p.h && p.n >= h * 1.5) &&
        Math.abs(measured[0].bottom - measured[1].bottom) <= 2
      ) {
        pieces = measured;
        break;
      }
    }
    if (pieces) return pieces;
  }
  return null;
}
function collectGlyphComponents(mask, width, height) {
  const components = [];
  let parts = [];
  for (let k = mask.indexOf(1); k !== -1; k = mask.indexOf(1, k + 1)) {
    const { queue, left, right, top, bottom, perimeter } = floodGlyphComponent(
      mask,
      width,
      height,
      k
    );
    const w = right - left + 1,
      h = bottom - top + 1,
      componentId = components.length;
    components.push({ x: left, y: top, w, h, n: queue.length, componentId, seed: queue[0] });
    const pieces = splitGlyphBridge(queue, width, { left, w, h }, componentId);
    if (pieces) {
      parts.push(...pieces);
      continue;
    }
    if (h >= 4 && w >= 2 && w < h * 2.5 && queue.length >= 4)
      parts.push({
        x: left,
        y: top,
        w,
        h,
        bottom,
        stroke: (2 * queue.length) / Math.max(1, perimeter),
        n: queue.length,
        componentId,
      });
  }
  return { components, parts };
}
function glyphForegroundContrast(foreground, foregroundLength, byteContrast) {
  const quantileIndex = Math.floor((foregroundLength - 1) * 0.8);
  let foregroundContrast;
  if (byteContrast) {
    let total = 0;
    for (let value = 0; value < 256; value++) {
      total += foreground[value];
      if (total > quantileIndex) {
        foregroundContrast = value;
        break;
      }
    }
  } else foregroundContrast = orderStatistic(foreground, quantileIndex);
  return foregroundContrast;
}
function glyphTypeStroke(mask, width, height, xh) {
  // Short orthogonal runs estimate ink width without treating the outline of a
  // curved or open letter as a thinner stroke. Long arms and stems are excluded.
  const runs = [],
    maxRun = Math.max(2, Math.ceil(xh * 0.65));
  for (const vertical of [false, true])
    for (let outer = 0; outer < (vertical ? width : height); outer++) {
      let length = 0;
      for (let inner = 0; inner <= (vertical ? height : width); inner++) {
        const ink =
          inner < (vertical ? height : width) &&
          mask[vertical ? inner * width + outer : outer * width + inner];
        if (ink) length++;
        else if (length) {
          if (length <= maxRun) runs.push(length);
          length = 0;
        }
      }
    }
  const typeStroke = runs.length ? orderStatistic(runs, Math.floor(runs.length * 0.4)) : null;
  return typeStroke;
}
export function computeGlyphMetricsAt(image, box, minimumGlyphs, luminance, factor) {
  const { width, height, mask, byteContrast, foreground, foregroundLength } = createGlyphMask(
    image,
    box,
    luminance,
    factor
  );
  const decorations = detachTextUnderlines(mask, width, height);
  const { components, parts: componentParts } = collectGlyphComponents(mask, width, height);
  let parts = componentParts;
  const tallest = Math.max(0, ...parts.map((p) => p.h));
  parts = parts.filter((p) => p.h >= tallest * 0.5);
  if (parts.length < minimumGlyphs) return null;
  const heights = parts.map((p) => p.h).sort((a, b) => a - b),
    strokes = parts.map((p) => p.stroke).sort((a, b) => a - b);
  const foregroundContrast = glyphForegroundContrast(foreground, foregroundLength, byteContrast);
  const xh = heights[Math.floor((heights.length - 1) * 0.3)],
    tolerance = Math.max(2, Math.ceil(xh * 0.4));
  const typeStroke = glyphTypeStroke(mask, width, height, xh);
  const baselineAgreement =
    Math.max(
      ...parts.map((p) => parts.filter((q) => Math.abs(q.bottom - p.bottom) <= tolerance).length)
    ) / parts.length;
  const heightAgreement =
    parts.filter((p) => p.h >= xh * 0.75 && p.h <= xh * 1.9).length / parts.length;
  const supportLeft = Math.min(...parts.map((p) => p.x)),
    supportTop = Math.min(...parts.map((p) => p.y));
  const supportRight = Math.max(...parts.map((p) => p.x + p.w)),
    supportBottom = Math.max(...parts.map((p) => p.y + p.h));
  const covered =
    parts.reduce((n, p) => n + p.n, 0) + decorations.reduce((n, p) => n + p.w * p.h, 0);
  const unexplained = components
    .filter(
      (p) =>
        p.n > foregroundLength * 0.3 &&
        p.h > xh * 1.8 &&
        !parts.some((q) => q.componentId === p.componentId)
    )
    .map((p) => ({
      x: box.x + p.x,
      y: box.y + p.y,
      w: p.w,
      h: p.h,
      n: p.n,
      seedX: box.x + (p.seed % width),
      seedY: box.y + Math.floor(p.seed / width),
    }));
  return {
    baselineAgreement,
    heightAgreement,
    xHeight: heights[Math.floor((heights.length - 1) * 0.3)],
    upperHeight: heights[Math.floor((heights.length - 1) * 0.75)],
    typeStroke,
    stroke: strokes[Math.floor(strokes.length / 2)],
    glyphs: parts.length,
    foregroundContrast,
    foregroundCoverage: covered / Math.max(1, foregroundLength),
    glyphBounds: {
      x: box.x + supportLeft,
      y: box.y + supportTop,
      w: supportRight - supportLeft,
      h: supportBottom - supportTop,
    },
    unexplained,
  };
}
