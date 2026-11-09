import {
  median,
  centerY,
  intersects as overlaps,
  bounds,
  inkParts,
  confirmedText,
} from './structure-topology.mjs';
import { colorDistanceAt } from './control-shapes.mjs';

export function continuationGlyphParts(image, a, b, boxes, measure, obstacles) {
  const roi = continuationGutter(a, b, boxes, obstacles);
  if (!roi) return null;
  const parts = inkParts(image, roi);
  if (!parts.length) return null;
  const support = bounds(parts),
    metrics = measure(image, { ...support, bg: a.bg }, 1),
    one = a.typeMetrics,
    two = b.typeMetrics;
  if (!metrics || !one || !two) return null;
  const xh = (one.xHeight + two.xHeight) / 2,
    stroke = (one.stroke + two.stroke) / 2;
  if (
    metrics.xHeight < xh * 0.6 ||
    metrics.xHeight > xh * 1.6 ||
    metrics.stroke < stroke * 0.65 ||
    metrics.stroke > stroke * 1.5
  )
    return null;
  const sideParts = [...inkParts(image, a), ...inkParts(image, b)].filter((p) => p.h >= xh * 0.6);
  const baseline = median(sideParts.map((p) => p.y + p.h));
  if (Math.abs(support.y + support.h - baseline) > Math.max(2, xh * 0.4)) return null;
  if (support.x - roi.x > xh * 0.8 || roi.x + roi.w - support.x - support.w > xh * 0.8) return null;
  return parts;
}

function continuationGutter(a, b, boxes, obstacles) {
  if (a.shape !== 'text' || b.shape !== 'text' || !a.textConfidence || !b.textConfidence)
    return null;
  if (a.structureGroup !== b.structureGroup && (a.structureGroup || b.structureGroup)) return null;
  const left = a.x < b.x ? a : b,
    right = left === a ? b : a,
    gap = right.x - left.x - left.w;
  if (
    gap < 3 ||
    gap > Math.min(a.h, b.h) * 2 ||
    Math.abs(centerY(a) - centerY(b)) > Math.min(a.h, b.h) * 0.25
  )
    return null;
  if (
    Math.min(a.h, b.h) < Math.max(a.h, b.h) * 0.7 ||
    Math.max(...a.bg.map((v, c) => Math.abs(v - b.bg[c]))) > 20
  )
    return null;
  const roi = {
    x: left.x + left.w,
    y: Math.min(a.y, b.y),
    w: gap,
    h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
    bg: a.bg,
  };
  if (
    obstacles.some(
      (o) =>
        overlaps(roi, o) &&
        !(
          ['control', 'outline'].includes(o.kind) &&
          a.x >= o.x &&
          b.x >= o.x &&
          a.x + a.w <= o.x + o.w &&
          b.x + b.w <= o.x + o.w &&
          a.y >= o.y &&
          b.y >= o.y &&
          a.y + a.h <= o.y + o.h &&
          b.y + b.h <= o.y + o.h
        )
    ) ||
    boxes.some(
      (q) => q !== a && q !== b && q.shape !== 'unknown' && q.shape !== 'text' && overlaps(roi, q)
    )
  )
    return null;
  return roi;
}

function hasBadgeCapsule(image, box, glyph) {
  const similar = (x, y) => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
    const i = (y * image.width + x) * 4;
    return colorDistanceAt(image.data, i, box.bg) <= 7;
  };
  let start = null;
  for (let y = glyph.y; y < glyph.y + glyph.h && !start; y++)
    for (let x = glyph.x; x < glyph.x + glyph.w; x++)
      if (similar(x, y)) {
        start = [x, y];
        break;
      }
  if (!start) return false;
  const { left, right, top, bottom, overflow, count } = badgeCapsuleFill(start, similar);
  const w = right - left + 1,
    h = bottom - top + 1;
  if (
    overflow ||
    w < glyph.w + 3 ||
    w > glyph.w + 24 ||
    h < glyph.h + 2 ||
    h > glyph.h + 14 ||
    w / h < 0.8 ||
    w / h > 3 ||
    count / (w * h) < 0.4 ||
    left > glyph.x + 1 ||
    right < glyph.x + glyph.w - 2 ||
    top > glyph.y + 1 ||
    bottom < glyph.y + glyph.h - 2
  )
    return false;
  return true;
}

function controlChevronProfile(image, b) {
  const parts = inkParts(image, b);
  if (parts.length !== 1) return null;
  const r = parts[0];
  if (r.w < 3 || r.h < 5 || r.w > r.h || r.w / r.h < 0.25) return null;
  const rows = [],
    pixels = new Set();
  for (let y = r.y; y < r.y + r.h; y++) {
    const xs = [];
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * image.width + x) * 4;
      if (Math.max(...b.bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 30) {
        xs.push(x);
        pixels.add(x - r.x + ',' + (y - r.y));
      }
    }
    if (xs.length) rows.push(xs.reduce((n, x) => n + x, 0) / xs.length);
  }
  const band = Math.max(1, Math.floor(rows.length / 3)),
    top = median(rows.slice(0, band)),
    mid = median(rows.slice(band, -band)),
    bottom = median(rows.slice(-band));
  if (
    !Number.isFinite(mid) ||
    Math.abs(top - bottom) > Math.max(0.75, r.w * 0.2) ||
    Math.abs(mid - (top + bottom) / 2) < r.w * 0.2
  )
    return null;
  return { r, pixels, turn: mid - (top + bottom) / 2 };
}

// Mirrored directional marks around the same bounded control share one role.
export function resolveControlPeers(image, input, frames) {
  const boxes = input.map((b) => ({ ...b }));
  for (const f of frames) {
    if (f.kind !== 'control' || f.w < 20 || f.w > 60 || f.h < 20 || f.h > 60) continue;
    const candidates = boxes.filter(
      (b) =>
        !b.roleEvidence &&
        b.shape !== 'image' &&
        b.w <= 20 &&
        b.h <= 24 &&
        Math.abs(centerY(b) - centerY(f)) <= f.h * 0.15
    );
    const left = candidates
        .filter((b) => b.x + b.w <= f.x && f.x - b.x - b.w <= f.w)
        .sort((a, b) => b.x - a.x)[0],
      right = candidates
        .filter((b) => b.x >= f.x + f.w && b.x - f.x - f.w <= f.w)
        .sort((a, b) => a.x - b.x)[0];
    if (
      !left ||
      !right ||
      Math.abs((left.x + left.w / 2 + right.x + right.w / 2) / 2 - (f.x + f.w / 2)) > 3
    )
      continue;
    const a = controlChevronProfile(image, left),
      b = controlChevronProfile(image, right);
    if (!a || !b || a.turn * b.turn >= 0 || a.r.w !== b.r.w || a.r.h !== b.r.h) continue;
    let both = 0,
      either = 0;
    for (let y = 0; y < a.r.h; y++)
      for (let x = 0; x < a.r.w; x++) {
        const one = a.pixels.has(x + ',' + y),
          two = b.pixels.has(a.r.w - 1 - x + ',' + y);
        both += one && two;
        either += one || two;
      }
    if (both / Math.max(1, either) < 0.75) continue;
    for (const box of [left, right]) {
      box.sourceBounds = { x: box.x, y: box.y, w: box.w, h: box.h };
      box.shape = 'icon';
      box.roleEvidence = 'control-chevron';
      box.iconSize = Math.max(4, Math.min(box.w, box.h) - 4);
      delete box.typeMetrics;
    }
  }
  return boxes;
}

// A small neutral filled capsule after a confirmed label supplies count context.
export function resolveTextBadges(image, input, measure) {
  const boxes = input.map((b) => ({ ...b }));
  for (const box of boxes) {
    if (
      !['icon', 'unknown'].includes(box.shape) ||
      box.kind === 'control-icon' ||
      box.shape === 'image' ||
      box.w > 30 ||
      box.h > 28
    )
      continue;
    if (box.roleEvidence && !['repeated-symbol'].includes(box.roleEvidence)) continue;
    const glyph = { ...box, ...(box.sourceBounds || {}) },
      m = measure(image, glyph, 1);
    if (!confirmedText(m) || m.glyphs !== 1 || glyph.w > glyph.h || m.xHeight < 6) continue;
    const label = boxes.find(
      (q) =>
        q !== box &&
        q.shape === 'text' &&
        q.textConfidence &&
        q.typeMetrics?.glyphs >= 2 &&
        q.w >= q.h * 1.5 &&
        q.x + q.w <= glyph.x &&
        glyph.x - q.x - q.w <= Math.max(18, m.xHeight * 2) &&
        Math.abs(centerY(q) - centerY(glyph)) <= Math.max(q.h, glyph.h) * 0.4
    );
    if (
      !label ||
      Math.max(...box.bg) - Math.min(...box.bg) > 20 ||
      Math.max(...box.bg.map((v, c) => Math.abs(v - label.bg[c]))) < 8
    )
      continue;
    if (!hasBadgeCapsule(image, box, glyph)) continue;
    Object.assign(box, glyph, {
      shape: 'text',
      kind: 'badge-text',
      roleEvidence: 'text-badge',
      typeMetrics: m,
      textConfidence: true,
      textSize: Math.max(4, 2 * Math.round((glyph.h - 4) / 2)),
    });
    delete box.sourceBounds;
    delete box.iconSize;
  }
  return boxes;
}

function badgeCapsuleFill(start, similar) {
  const queue = [start],
    seen = new Set([start.join(',')]);
  let left = start[0],
    right = left,
    top = start[1],
    bottom = top,
    overflow = false;
  for (let n = 0; n < queue.length; n++) {
    const [x, y] = queue[n];
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    if (right - left > 64 || bottom - top > 40 || queue.length > 2500) {
      overflow = true;
      break;
    }
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const xx = x + dx,
        yy = y + dy,
        key = xx + ',' + yy;
      if (!seen.has(key) && similar(xx, yy)) {
        seen.add(key);
        queue.push([xx, yy]);
      }
    }
  }
  return { left, right, top, bottom, overflow, count: queue.length };
}

// Thin marks attached above a confirmed glyph share its text ownership.
export function absorbTextMarks(image, input, measure) {
  const boxes = input.map((b) => ({ ...b })),
    removed = new Set();
  for (const mark of boxes) {
    if (mark.shape === 'image' || mark.kind === 'control-icon' || mark.roleEvidence === 'separator')
      continue;
    const parts = inkParts(image, { ...mark, ...(mark.sourceBounds || {}) });
    if (!parts.length) continue;
    const ink = bounds(parts);
    if (ink.h > 4 || ink.w > 16) continue;
    for (const text of boxes) {
      if (text === mark || text.shape !== 'text' || !text.textConfidence || !text.typeMetrics)
        continue;
      const xh = text.typeMetrics.xHeight;
      if (ink.h > xh * 0.5 || ink.w > xh * 1.2 || ink.x < text.x || ink.x + ink.w > text.x + text.w)
        continue;
      const body = inkParts(image, text).some(
        (p) =>
          p.h >= xh * 0.7 &&
          p.x < ink.x + ink.w &&
          p.x + p.w > ink.x &&
          p.y >= ink.y + ink.h - 1 &&
          p.y - ink.y - ink.h <= xh * 0.5
      );
      if (!body) continue;
      const bottom = text.y + text.h;
      text.y = Math.min(text.y, ink.y - 1);
      text.h = bottom - text.y;
      text.typeMetrics = measure(image, text) || text.typeMetrics;
      removed.add(mark);
      break;
    }
  }
  return boxes.filter((b) => !removed.has(b));
}

// Independent labeled rows establish a text column before toolbar inference.
export function resolveTextColumns(image, input, measure) {
  const boxes = input.map((b) => ({ ...b }));
  const items = boxes
    .filter(
      (b) =>
        !b.roleEvidence &&
        b.kind !== 'control-icon' &&
        b.shape !== 'image' &&
        b.w <= 40 &&
        b.h >= 9 &&
        b.h <= 28
    )
    .map((box) => {
      const m = measure(image, box);
      return { box, m: confirmedText(m) ? m : measure(image, box, 1) };
    })
    .filter((p) => confirmedText(p.m));
  const labels = boxes
    .filter((b) => b.shape === 'text' && b.w >= 35)
    .map((box) => ({ box, m: measure(image, box) }))
    .filter((p) => confirmedText(p.m) && p.m.glyphs >= 3);
  for (const seed of items.filter((p) => p.m.glyphs >= 2)) {
    const peers = items.filter(
      (p) =>
        Math.abs(p.box.x + p.box.w - seed.box.x - seed.box.w) <= 4 &&
        Math.min(p.m.xHeight, seed.m.xHeight) >= Math.max(p.m.xHeight, seed.m.xHeight) * 0.75 &&
        Math.min(p.m.stroke, seed.m.stroke) >= Math.max(p.m.stroke, seed.m.stroke) * 0.65
    );
    const supported = peers.filter((p) =>
      labels.some(
        (q) =>
          q.box !== p.box &&
          ((q.box.x + q.box.w <= p.box.x - 8 && p.box.x - q.box.x - q.box.w < 500) ||
            (q.box.x >= p.box.x + p.box.w + 8 && q.box.x - p.box.x - p.box.w < 500)) &&
          Math.abs(centerY(q.box) - centerY(p.box)) <= Math.max(q.box.h, p.box.h) * 0.35
      )
    );
    if (supported.length < 4) continue;
    const ys = [...new Set(supported.map((p) => centerY(p.box)))].sort((a, b) => a - b),
      gaps = ys.slice(1).map((y, i) => y - ys[i]);
    if (
      ys.length < 4 ||
      gaps.filter((g) => g >= seed.m.xHeight * 1.5 && g <= seed.m.xHeight * 5).length < 3
    )
      continue;
    for (const { box, m } of peers) {
      box.shape = 'text';
      box.roleEvidence = 'text-column';
      box.kind = 'column-text';
      box.typeMetrics = m;
      delete box.iconSize;
      delete box.sourceBounds;
    }
  }
  return boxes;
}

function textFlowContext(image, box, input, measure) {
  const peers = input
    .filter((q) => {
      if (
        q === box ||
        q.shape !== 'text' ||
        q.w < q.h * 2 ||
        Math.max(...q.bg.map((v, c) => Math.abs(v - box.bg[c]))) > 20
      )
        return false;
      const dy = Math.abs(centerY(q) - centerY(box)),
        gap = Math.max(q.x - box.x - box.w, box.x - q.x - q.w);
      if (dy > Math.max(q.h, box.h) * 7) return false;
      const sameRow = dy <= Math.max(q.h, box.h) * 0.25 && gap >= 0 && gap <= box.h * 2;
      const otherRow =
        dy >= Math.min(q.h, box.h) * 0.6 &&
        Math.min(q.x + q.w, box.x + box.w) - Math.max(q.x, box.x) >= Math.min(q.w, box.w) * 0.3;
      return sameRow || otherRow;
    })
    .map((box) => ({ box, m: box.typeMetrics || measure(image, box) }))
    .filter((p) => confirmedText(p.m) && p.m.glyphs >= 3)
    .sort(
      (a, b) => Math.abs(centerY(a.box) - centerY(box)) - Math.abs(centerY(b.box) - centerY(box))
    );
  for (const seed of peers) {
    const family = peers.filter(
      (p) =>
        Math.min(p.m.xHeight, seed.m.xHeight) >= Math.max(p.m.xHeight, seed.m.xHeight) * 0.75 &&
        Math.min(p.m.stroke, seed.m.stroke) >= Math.max(p.m.stroke, seed.m.stroke) * 0.65
    );
    const rows = [...new Set(family.map((p) => Math.round(centerY(p.box))))];
    if (rows.length >= 2) return seed;
  }
  return null;
}

export function fitsTextFlow(image, fragment, parent, input, measure) {
  const context = textFlowContext(image, parent, input, measure);
  if (!context) return false;
  const parts = inkParts(image, fragment),
    xh = context.m.xHeight;
  // Antialiased letter pairs can share a component. The paragraph font and
  // independently measured glyphs establish text, not the component count.
  if (parts.length === 1 || fragment.w < fragment.h * 1.1) {
    const m = measure(image, fragment, 1),
      font = context.m;
    return (
      confirmedText(m) &&
      Math.abs(centerY(fragment) - centerY(context.box)) >=
        Math.min(fragment.h, context.box.h) * 0.6 &&
      Math.abs(centerY(fragment) - centerY(context.box)) <=
        Math.max(fragment.h, context.box.h) * 3 &&
      m.glyphs >= 2 &&
      m.foregroundCoverage >= 0.9 &&
      Math.min(m.upperHeight, font.upperHeight) >=
        Math.max(m.upperHeight, font.upperHeight) * 0.75 &&
      Math.min(m.stroke, font.stroke) >= Math.max(m.stroke, font.stroke) * 0.65 &&
      fragment.h <= Math.max(m.upperHeight, font.upperHeight) * 1.5 &&
      fragment.w <= m.glyphs * xh * 1.5 &&
      parts.every((p) => p.n / (p.w * p.h) < 0.85)
    );
  }
  return (
    fragment.w >= fragment.h * 1.1 &&
    parts.length >= 2 &&
    parts.some((p) => p.h >= xh * 0.6) &&
    parts.every((p) => p.w <= xh * 1.5 && p.h <= xh * 2 && (p.h <= 3 || p.n / (p.w * p.h) < 0.85))
  );
}

export function recoverTextFlow(image, input, measure) {
  return input.map((box) => {
    if (
      !['unknown', 'icon'].includes(box.shape) ||
      (box.roleEvidence && box.roleEvidence !== 'structured-symbol') ||
      box.kind === 'control-icon'
    )
      return box;
    const fragment = { ...box, ...(box.sourceBounds || {}) };
    if (!fitsTextFlow(image, fragment, fragment, input, measure)) return box;
    const context = textFlowContext(image, fragment, input, measure);
    const row = input.find(
      (q) =>
        q !== box &&
        q.shape === 'text' &&
        q.textConfidence &&
        Math.abs(centerY(q) - centerY(fragment)) <= 3 &&
        Math.max(q.x - fragment.x - fragment.w, fragment.x - q.x - q.w, 0) <= fragment.h * 4
    );
    const result = {
      ...fragment,
      shape: 'text',
      kind: 'flow-text',
      roleEvidence: 'text-flow',
      textSize:
        row?.textSize || context.box.textSize || Math.max(4, 2 * Math.round(context.m.xHeight / 2)),
      typeMetrics: { ...context.m, inferredFromContext: true },
      textConfidence: true,
    };
    if (row?.textCenterY !== undefined) result.textCenterY = row.textCenterY;
    delete result.sourceBounds;
    delete result.iconSize;
    return result;
  });
}
