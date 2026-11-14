import { attachedAnimationBounds } from './attached-bounds.js';
import type { AnimationTemplate } from './types.js';
/** Font measurement uses the accepted resource in the sandbox, never a browser fallback font. */
export type AnimationTextMeasure = (text: string, fontSize: number) => number;
export type AnimationTextLayout = {
  text: string;
  fontSize: number;
  width: number;
  height: number;
  lines: readonly string[];
};

/** Fixed caption/callout reflow changes text and its box; it never changes scene anchors or pointer tips. */
export function layoutAnimationText(input: {
  text: string;
  width: number;
  fontSize: number;
  minFontSize: number;
  padding: number;
  lineHeight: number;
  maxLines: number;
  measure: AnimationTextMeasure;
}): AnimationTextLayout {
  const { width, padding, lineHeight, maxLines, measure } = input;
  if (
    ![width, input.fontSize, input.minFontSize, padding, lineHeight, maxLines].every(
      Number.isFinite
    ) ||
    width <= padding * 2 ||
    input.minFontSize <= 0 ||
    input.fontSize < input.minFontSize ||
    padding < 0 ||
    lineHeight <= 0 ||
    !Number.isSafeInteger(maxLines) ||
    maxLines < 1
  )
    throw new Error('Invalid animation text layout.');
  const available = width - padding * 2;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const wrap = (size: number) => {
    const lines: string[] = [];
    for (const paragraph of input.text.replace(/\r\n?/gu, '\n').split('\n')) {
      let line = '';
      for (const token of paragraph.match(/\S+|[^\S\n]+/gu) ?? []) {
        if (measure(line + token, size) <= available) {
          line += token;
          continue;
        }
        if (line.trim()) {
          lines.push(line.trimEnd());
          line = '';
        }
        if (!token.trim()) continue;
        for (const { segment } of segmenter.segment(token)) {
          if (line && measure(line + segment, size) > available) {
            lines.push(line);
            line = '';
          }
          line += segment;
        }
      }
      lines.push(line.trimEnd());
    }
    return lines;
  };
  const fits = (lines: readonly string[], size: number) =>
    lines.length <= maxLines && lines.every((line) => measure(line, size) <= available);
  let size = input.fontSize;
  let lines = wrap(size);
  if (!fits(lines, size)) {
    let low = input.minFontSize,
      high = size;
    const minimum = wrap(low);
    if (!fits(minimum, low))
      throw new Error('Animation text does not fit at the minimum font size.');
    lines = minimum;
    for (let step = 0; step < 16; step++) {
      const middle = (low + high) / 2;
      const candidate = wrap(middle);
      if (fits(candidate, middle)) {
        low = middle;
        lines = candidate;
      } else high = middle;
    }
    size = low;
  }
  return {
    text: lines.join('\n'),
    lines,
    fontSize: size,
    width: Math.max(
      1,
      Math.min(width, Math.max(...lines.map((line) => measure(line, size))) + padding * 2)
    ),
    height: lines.length * size * lineHeight + padding * 2,
  };
}

type AnimationPlacement = { x: number; y: number; width: number; height: number; rotation: number };

/** Only raster bounds grow. The source object box and scene anchors retain their authored coordinates. */
export function resolveAnimationObjectRenderBounds(
  template: AnimationTemplate,
  controls: Readonly<Record<string, unknown>>
) {
  let x = 0,
    y = 0,
    right = template.animation.w,
    bottom = template.animation.h;
  for (const handle of template.objectLayout?.handles ?? []) {
    const px = controls[handle.xControl],
      py = controls[handle.yControl],
      padding = handle.padding ?? 16;
    if (
      typeof px !== 'number' ||
      typeof py !== 'number' ||
      !Number.isFinite(px) ||
      !Number.isFinite(py) ||
      Math.abs(px) > 1_000_000 ||
      Math.abs(py) > 1_000_000 ||
      !Number.isFinite(padding) ||
      padding < 0 ||
      padding > 256
    )
      throw new Error('Animation handle geometry is invalid.');
    x = Math.min(x, px - padding);
    y = Math.min(y, py - padding);
    right = Math.max(right, px + padding);
    bottom = Math.max(bottom, py + padding);
  }
  const attached = attachedAnimationBounds(template, controls);
  if (attached) {
    x = Math.min(x, Math.floor(attached.x) - 2);
    y = Math.min(y, Math.floor(attached.y) - 2);
    right = Math.max(right, Math.ceil(attached.right) + 2);
    bottom = Math.max(bottom, Math.ceil(attached.bottom) + 2);
  }
  return { x, y, width: right - x, height: bottom - y };
}
function checkPlacement(placement: AnimationPlacement, point: { x: number; y: number }) {
  if (
    !Object.values(placement).every(Number.isFinite) ||
    placement.width <= 0 ||
    placement.height <= 0 ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  )
    throw new Error('Animation placement is invalid.');
}
/** Inverse of the same object placement used to draw the bitmap and its editor handles. */
export function mapAnimationScenePoint(
  template: AnimationTemplate,
  placement: AnimationPlacement,
  point: { x: number; y: number }
) {
  checkPlacement(placement, point);
  const dx = point.x - placement.x - placement.width / 2,
    dy = point.y - placement.y - placement.height / 2;
  const cos = Math.cos(placement.rotation),
    sin = Math.sin(placement.rotation);
  return {
    x: ((dx * cos + dy * sin + placement.width / 2) * template.animation.w) / placement.width,
    y: ((-dx * sin + dy * cos + placement.height / 2) * template.animation.h) / placement.height,
  };
}
/** Map an authored local point to the scene before its shared camera/3D projection. */
export function mapAnimationObjectPoint(
  template: AnimationTemplate,
  placement: AnimationPlacement,
  point: { x: number; y: number }
) {
  checkPlacement(placement, point);
  const dx = (point.x * placement.width) / template.animation.w - placement.width / 2,
    dy = (point.y * placement.height) / template.animation.h - placement.height / 2;
  const cos = Math.cos(placement.rotation),
    sin = Math.sin(placement.rotation);
  return {
    x: placement.x + placement.width / 2 + dx * cos - dy * sin,
    y: placement.y + placement.height / 2 + dx * sin + dy * cos,
  };
}

/** A fixed triangle follows the box edge while its scene-bound tip remains unchanged. */
export function layoutAnimationPointer(
  box: { width: number; height: number },
  tip: { x: number; y: number },
  width: number
) {
  if (
    ![box.width, box.height, tip.x, tip.y, width].every(Number.isFinite) ||
    box.width <= 0 ||
    box.height <= 0 ||
    width <= 0
  )
    throw new Error('Animation pointer geometry is invalid.');
  const cx = box.width / 2,
    cy = box.height / 2,
    dx = tip.x - cx,
    dy = tip.y - cy;
  if (tip.x >= 0 && tip.x <= box.width && tip.y >= 0 && tip.y <= box.height)
    return { position: { x: cx, y: cy }, scale: { x: 0, y: 0 }, rotation: 0 };
  const tx = dx === 0 ? Infinity : cx / Math.abs(dx),
    ty = dy === 0 ? Infinity : cy / Math.abs(dy),
    amount = Math.min(tx, ty);
  let x = cx + dx * amount,
    y = cy + dy * amount;
  const thickness = Math.min(width, tx < ty ? box.height : box.width);
  if (tx < ty) y = Math.max(thickness / 2, Math.min(box.height - thickness / 2, y));
  else x = Math.max(thickness / 2, Math.min(box.width - thickness / 2, x));
  return {
    position: { x, y },
    scale: { x: thickness * 100, y: Math.hypot(tip.x - x, tip.y - y) * 100 },
    rotation: (Math.atan2(tip.y - y, tip.x - x) * 180) / Math.PI - 90,
  };
}

/** A unit shaft and triangle are authored in Lottie. The host only binds their fixed endpoint geometry. */
export function layoutAnimationArrow(
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number
) {
  if (![start.x, start.y, end.x, end.y, width].every(Number.isFinite) || width <= 0 || width > 128)
    throw new Error('Animation arrow geometry is invalid.');
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = Math.hypot(dx, dy);
  const headLength = Math.min(length, width * 4),
    shaftLength = Math.max(0, length - headLength);
  return {
    position: { ...start },
    rotation: length === 0 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI - 90,
    shaftScale: { x: length === 0 ? 0 : width * 100, y: shaftLength * 100 },
    headPosition: { x: 0, y: shaftLength },
    headScale: { x: length === 0 ? 0 : width * 300, y: headLength * 100 },
  };
}
