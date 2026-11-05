import { buildPresentation, naturalIconGeometry } from './presentation.mjs';
import { eraseOwned } from './erasures.mjs';
import { buildDetectionCatalog, selectDetection } from './detector.mjs';
export const ENGINE_VERSION = 'simplify-v1';
export const SENSITIVITIES = [10, 55, 90];
export const THICKNESSES = [0.35, 0.5, 0.65];
export const COMBINATIONS = SENSITIVITIES.flatMap((sensitivity) =>
  THICKNESSES.flatMap((thickness) =>
    ['text', 'all'].flatMap((content) =>
      ['auto', 'custom'].map((color) => ({
        id: `s${sensitivity}-t${Math.round(thickness * 100)}-${content}-${color}`,
        sensitivity,
        thickness,
        content,
        color,
      }))
    )
  )
);
export const DEFAULTS = {
  sensitivity: 55,
  thickness: 0.5,
  content: 'all',
  color: 'auto',
  customColor: '#8da8c7',
};
const presentationCache = new WeakMap();
export function prepare(image) {
  const catalog = buildDetectionCatalog(image);
  presentationCache.set(catalog, buildPresentation(catalog, image.width, image.height));
  return catalog;
}
function presentationFor(catalog, width, height) {
  let plan = presentationCache.get(catalog);
  if (!plan) {
    plan = buildPresentation(catalog, width, height);
    presentationCache.set(catalog, plan);
  }
  return plan;
}
export function choose(catalog, settings) {
  return selectDetection(catalog, settings.sensitivity).filter((b) =>
    settings.content === 'all' ? b.shape !== 'unknown' : b.shape === 'text'
  );
}
function paintImage(ctx, b, settings) {
  const dark = b.bg[0] * 0.2126 + b.bg[1] * 0.7152 + b.bg[2] * 0.0722 < 130;
  const fill =
    settings.color === 'custom'
      ? settings.customColor || DEFAULTS.customColor
      : dark
        ? '#405065'
        : '#dfe5ec';
  ctx.fillStyle = fill;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  if (Math.min(b.w, b.h) < 36) return;
  const size = Math.min(32, Math.floor(Math.min(b.w, b.h) * 0.3)),
    x = Math.round(b.x + (b.w - size) / 2),
    y = Math.round(b.y + (b.h - size) / 2);
  const rgb = fill
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16)),
    l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  ctx.strokeStyle = l < 130 ? '#c1cbd7' : '#7c899a';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 4, size - 2, size - 8, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 3, y + size - 7);
  ctx.lineTo(x + size * 0.38, y + size * 0.49);
  ctx.lineTo(x + size * 0.59, y + size * 0.68);
  ctx.lineTo(x + size * 0.73, y + size * 0.55);
  ctx.lineTo(x + size - 3, y + size - 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size * 0.7, y + size * 0.32, 2, 0, Math.PI * 2);
  ctx.stroke();
}
function textPaintVertical(b, settings, presentation = null) {
  const support = b.typeMetrics?.glyphBounds;
  const ownSupport =
    support &&
    !b.typeMetrics.inferredFromContext &&
    support.y >= b.y - 1 &&
    support.y + support.h <= b.y + b.h + 1;
  const limit =
    presentation?.shape === 'text'
      ? presentation.heightLimit
      : Number.isFinite(b.textHeightLimit)
        ? b.textHeightLimit
        : ownSupport
          ? support.h
          : Math.max(2, b.h - 2);
  const glyph = presentation?.textSize || b.textSize || Math.max(2, b.h - 4),
    height = Math.max(2, Math.min(limit, Math.max(2, Math.round(glyph * settings.thickness))));
  return {
    height,
    y: Math.round((presentation?.centerY ?? b.textCenterY ?? b.y + b.h / 2) - height / 2),
  };
}
export function drawReplacement(ctx, b, settings, presentation = null) {
  if (b.shape === 'image' || b.shape === 'graphic') {
    paintImage(ctx, b.shape === 'graphic' ? { ...b, ...b.paintBounds } : b, settings);
    return;
  }
  const dark = b.bg[0] * 0.2126 + b.bg[1] * 0.7152 + b.bg[2] * 0.0722 < 130;
  let color =
    settings.color === 'custom'
      ? settings.customColor || DEFAULTS.customColor
      : dark
        ? '#8593a6'
        : '#b8c1cd';
  if (settings.color !== 'custom' && Number.isFinite(b.contrast)) {
    const rgb = color
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
    const maximum = Math.max(...rgb.map((v, c) => Math.abs(v - b.bg[c]))),
      factor = Math.min(1, b.contrast / Math.max(1, maximum));
    color = `rgb(${rgb.map((v, c) => Math.round(b.bg[c] + (v - b.bg[c]) * factor)).join(',')})`;
  }
  ctx.fillStyle = color;
  if (b.shape === 'icon') {
    if (presentation?.shape === 'icon') {
      ctx.beginPath();
      ctx.roundRect(
        presentation.x,
        presentation.y,
        presentation.w,
        presentation.h,
        Math.min(4, presentation.h * 0.15)
      );
      ctx.fill();
      return;
    }
    const rect = naturalIconGeometry(b);
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.min(4, rect.h * 0.15));
    ctx.fill();
    return;
  }
  const { height, y } = textPaintVertical(b, settings, presentation),
    inset = Math.min(2, b.w * 0.05);
  // Proposal padding is not a font metric. A real control interior, however,
  // remains a clipping boundary when a normalized bar meets its edge.
  ctx.save();
  for (const c of [b.supportConstraint, b.surfaceClip])
    if (c) {
      ctx.beginPath();
      ctx.rect(c.x, c.y, c.w, c.h);
      ctx.clip();
    }
  ctx.beginPath();
  ctx.roundRect(
    Math.round(b.x + inset),
    y,
    Math.max(1, b.w - inset * 2),
    height,
    Math.min(2, height / 3)
  );
  ctx.fill();
  ctx.restore();
}
export function paint(ctx, b, settings) {
  if (b.shape !== 'image') eraseOwned(ctx, b);
  drawReplacement(ctx, b, settings);
}
function restore(ctx, source, b) {
  // Source-over would blend translucent source pixels with the replacement.
  // Clear only the owned support, under the existing ROI clip, before copying.
  const copy = (x, y, w, h) => {
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(source, x, y, w, h, x, y, w, h);
  };
  if (b.sourceRuns) {
    for (const [y, x, w] of b.sourceRuns) copy(x, y, w, 1);
  } else if (b.kind === 'outline') {
    const t = b.stroke || 1;
    for (const r of [
      [b.x, b.y, b.w, t],
      [b.x, b.y + b.h - t, b.w, t],
      [b.x, b.y + t, t, Math.max(0, b.h - 2 * t)],
      [b.x + b.w - t, b.y + t, t, Math.max(0, b.h - 2 * t)],
    ])
      if (r[2] > 0 && r[3] > 0) copy(...r);
  } else {
    const r = b.sourceBounds || b;
    copy(r.x, r.y, r.w, r.h);
  }
}
function clipFrame(ctx, frame, paint, contours) {
  ctx.beginPath();
  if (frame.sourceRuns?.length) {
    let rows = contours.get(frame);
    if (!rows) {
      rows = new Map();
      for (const [y, x, w] of frame.sourceRuns) {
        let row = rows.get(y);
        if (!row) {
          row = { left: -Infinity, right: Infinity };
          rows.set(y, row);
        }
        if (x < frame.x + frame.w / 2) row.left = Math.max(row.left, x + w);
        if (x + w > frame.x + frame.w / 2) row.right = Math.min(row.right, x);
      }
      contours.set(frame, rows);
    }
    for (
      let y = Math.max(frame.y + 1, paint.y);
      y < Math.min(frame.y + frame.h - 1, paint.y + paint.height);
      y++
    ) {
      const row = rows.get(y),
        x0 = Number.isFinite(row?.left) ? row.left : frame.x + 1,
        x1 = Number.isFinite(row?.right) ? row.right : frame.x + frame.w - 1;
      if (x1 > x0) ctx.rect(x0, y, x1 - x0, 1);
    }
  } else {
    const t = frame.stroke || 1;
    ctx.rect(frame.x + t, frame.y + t, Math.max(0, frame.w - 2 * t), Math.max(0, frame.h - 2 * t));
  }
  ctx.clip();
}
function containingFrame(box, frames) {
  const metrics = box.typeMetrics,
    glyph = metrics?.glyphBounds;
  const g =
    glyph &&
    !metrics.inferredFromContext &&
    glyph.x >= box.x - 1 &&
    glyph.y >= box.y - 1 &&
    glyph.x + glyph.w <= box.x + box.w + 1 &&
    glyph.y + glyph.h <= box.y + box.h + 1
      ? glyph
      : box.sourceBounds;
  if (!g) return null;
  return frames
    .filter(
      (f) =>
        f.kind === 'outline' &&
        g.x >= f.x &&
        g.y >= f.y &&
        g.x + g.w <= f.x + f.w &&
        g.y + g.h <= f.y + f.h
    )
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}
export function render(ctx, source, catalog, settings, roi = null) {
  ctx.clearRect(0, 0, source.width, source.height);
  ctx.drawImage(source, 0, 0);
  ctx.save();
  if (roi) {
    ctx.beginPath();
    ctx.rect(roi.x, roi.y, roi.w, roi.h);
    ctx.clip();
  }
  const rank = { image: 0, graphic: 1, icon: 2, text: 3 };
  const boxes = choose(catalog, settings).sort(
    (a, b) => rank[a.shape] - rank[b.shape] || a.y - b.y || a.x - b.x
  );
  for (const box of boxes) if (box.shape !== 'image') eraseOwned(ctx, box);
  const contours = new Map(),
    presentation = presentationFor(catalog, source.width, source.height);
  for (const box of boxes) {
    ctx.save();
    const frame = box.shape === 'text' && containingFrame(box, catalog.protected || []);
    if (frame)
      clipFrame(ctx, frame, textPaintVertical(box, settings, presentation.get(box)), contours);
    drawReplacement(ctx, box, settings, presentation.get(box));
    ctx.restore();
  }
  const preserve = [
    ...(catalog.protected || []),
    ...catalog.filter((b) => b.shape === 'unknown'),
    ...(settings.content === 'text'
      ? catalog.filter((b) => ['icon', 'image', 'graphic'].includes(b.shape))
      : []),
  ];
  for (const box of preserve) restore(ctx, source, box);
  ctx.restore();
  return boxes;
}
