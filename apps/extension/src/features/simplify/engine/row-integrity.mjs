import { intersects, bottom, right } from './structure-topology.mjs';
// Preserve a row when a source fragment and a competing owner make its extent uncertain.
// This pass does not infer text from colour, a bounding-box overlap, or proximity alone.
import { inkParts } from './structure.mjs';
import {
  continuousTextureClaim,
  preserveTextureClaim,
  texturedRow,
  scanBrightColumn,
} from './row-texture.mjs';

const compatible = (a, b) =>
  Math.abs(bottom(a) - bottom(b)) <= Math.max(3, a.h * 0.25) &&
  Math.abs(a.h - b.h) <= Math.max(4, a.h * 0.35);

function brightColumns(image, box, text) {
  const bg = text.bg,
    threshold = Math.max(100, (text.contrast || 0) * 0.55),
    columns = [];
  const y0 = Math.max(0, Math.floor(text.y)),
    y1 = Math.min(image.height, Math.ceil(bottom(text)));
  for (
    let x = Math.max(0, Math.floor(box.x));
    x < Math.min(image.width, Math.ceil(right(box)));
    x++
  ) {
    const { count, top, low } = scanBrightColumn(image, bg, x, y0, y1, threshold);
    columns.push({ x, count, top, low });
  }
  const groups = [];
  for (const c of columns) {
    if (!c.count) continue;
    const last = groups.at(-1);
    if (last && c.x <= last.right + 1) {
      last.right = c.x;
      last.top = Math.min(last.top, c.top);
      last.bottom = Math.max(last.bottom, c.low);
      last.n += c.count;
    } else groups.push({ x: c.x, right: c.x, top: c.top, bottom: c.low, n: c.count });
  }
  return groups.filter(
    (g) =>
      g.right - g.x + 1 >= 2 &&
      g.bottom - g.top + 1 >= text.typeMetrics.xHeight * 0.7 &&
      g.n >= text.typeMetrics.xHeight
  );
}

export function preserveUncertainRows(image, input) {
  let boxes = [...input];
  for (const seed of input) {
    if (
      !boxes.includes(seed) ||
      seed.shape !== 'text' ||
      !seed.textConfidence ||
      !seed.typeMetrics ||
      !seed.bg
    )
      continue;
    const h = seed.typeMetrics.xHeight;
    if (h < 5) continue;
    const conflict = uncertainRowConflict(image, seed, boxes);
    let { left, top, end, base } = conflict.extent;
    const { reason, conflicting } = conflict;
    if (!reason) {
      const textured = texturedRow(image, seed, boxes);
      if (textured) {
        const { area, members, bg } = textured,
          removed = new Set(members);
        boxes = boxes
          .map((b) => (continuousTextureClaim(image, b, area) ? preserveTextureClaim(b) : b))
          .filter((b) => !removed.has(b));
        boxes.push({
          ...area,
          bg,
          shape: 'unknown',
          kind: 'incomplete-text-row',
          roleEvidence: 'textured-fragmented-row',
          sourceBounds: area,
          contrast: seed.contrast,
        });
      }
      continue;
    }
    // Continue through independently confirmed text on the same baseline. A
    // separate icon/graphic between claims ends the group.
    const extension = extendUncertainRow(seed, boxes, h, top, end, base);
    const { members } = extension;
    ({ top, end, base } = extension);
    const bounds = {
      x: Math.max(0, Math.floor(left)),
      y: Math.max(0, Math.floor(top)),
      w: Math.ceil(end) - Math.max(0, Math.floor(left)),
      h: Math.ceil(base) - Math.max(0, Math.floor(top)),
    };
    const remove = new Set(members);
    if (conflicting) remove.add(conflicting);
    boxes = boxes.filter((b) => !remove.has(b));
    boxes.push({
      ...bounds,
      bg: seed.bg,
      shape: 'unknown',
      kind: 'incomplete-text-row',
      roleEvidence: reason,
      sourceBounds: bounds,
      contrast: seed.contrast,
    });
  }
  if (input.protected) boxes.protected = input.protected;
  return boxes;
}

function unresolvedContinuation(image, seed, boxes, h, left) {
  let found = false;
  for (const u of boxes.filter((b) => b.shape === 'unknown' && !b.roleEvidence)) {
    if (
      u.w < seed.h * 2 ||
      u.h < seed.h * 2 ||
      u.x >= seed.x ||
      right(u) < seed.x - h * 0.6 ||
      right(u) > seed.x + h * 0.4 ||
      u.y >= bottom(seed) ||
      bottom(u) <= seed.y
    )
      continue;
    const probe = {
      x: Math.max(u.x, seed.x - h * 3.5),
      w: Math.min(right(u), seed.x) - Math.max(u.x, seed.x - h * 3.5),
    };
    const groups = brightColumns(image, probe, seed).filter(
      (g) =>
        Math.abs(
          g.bottom - (seed.typeMetrics.glyphBounds?.y + seed.typeMetrics.glyphBounds?.h - 1)
        ) <= Math.max(2, h * 0.25)
    );
    if (
      groups.length < 3 ||
      groups.at(-1).right < (seed.typeMetrics.glyphBounds?.x ?? seed.x) - h * 0.5
    )
      continue;
    const tail = groups.slice(-3);
    if (tail.some((g, i) => i && g.x - tail[i - 1].right > h * 0.7)) continue;
    left = Math.min(left, tail[0].x - 1);
    found = true;
  }
  return found ? left : null;
}

function clippedRowGlyph(image, seed, h) {
  const area = {
    x: Math.max(0, seed.x - 1),
    y: Math.max(0, seed.y - h),
    w: Math.min(image.width - Math.max(0, seed.x - 1), seed.w + h * 2.5),
    h: Math.min(image.height - Math.max(0, seed.y - h), seed.h + h * 2),
    bg: seed.bg,
  };
  const parts = inkParts(image, area).sort((a, b) => a.x - b.x);
  const extra = parts.find(
    (p) =>
      p.x >= right(seed) - 1 &&
      p.x - right(seed) <= h * 0.5 &&
      p.h >= h * 0.8 &&
      p.h <= h * 1.8 &&
      p.w <= h * 1.2 &&
      Math.abs(bottom(p) - (seed.typeMetrics.glyphBounds.y + seed.typeMetrics.glyphBounds.h)) <=
        Math.max(2, h * 0.25) &&
      Math.max(...p.rgb.map((v, k) => Math.abs(v - seed.bg[k]))) >= 40
  );
  if (extra) {
    const surface = parts.find(
      (p) =>
        p.x >= right(extra) &&
        p.x - right(extra) <= h * 0.6 &&
        p.h >= h * 2 &&
        p.w >= 2 &&
        Math.max(...p.rgb) - Math.min(...p.rgb) >= 50
    );
    if (surface) return extra;
  }
  return null;
}

function conflictingRowClaim(image, seed, boxes, h, glyph) {
  return boxes.find((b) => {
    const src = b.sourceBounds;
    if (
      b.shape !== 'icon' ||
      b.kind !== 'auto' ||
      b.roleEvidence ||
      b.compact ||
      !src ||
      src.x < glyph.x ||
      right(src) > right(glyph) + 1 ||
      src.x < glyph.x + glyph.w * 0.55 ||
      src.y < glyph.y - 2 ||
      bottom(src) > bottom(glyph) + 2 ||
      src.h < h * 0.7
    )
      return false;
    return hasOccludingSurface(image, seed, glyph, h);
  });
}

function hasOccludingSurface(image, seed, glyph, h) {
  const from = Math.max(0, Math.floor(right(glyph) - 1)),
    to = Math.min(image.width, Math.ceil(right(glyph) + h * 0.7));
  const y0 = Math.max(0, Math.floor(glyph.y - h)),
    y1 = Math.min(image.height, Math.ceil(bottom(glyph) + h));
  for (let x = from; x < to; x++) {
    let n = 0,
      above = 0,
      below = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * image.width + x) * 4,
        c = [image.data[i], image.data[i + 1], image.data[i + 2]];
      if (
        image.data[i + 3] >= 128 &&
        Math.max(...c) - Math.min(...c) >= 50 &&
        Math.max(...c.map((v, k) => Math.abs(v - seed.bg[k]))) >= 50
      ) {
        n++;
        if (y < glyph.y) above++;
        if (y >= bottom(glyph)) below++;
      }
    }
    if (n >= h * 2 && above >= h * 0.4 && below >= h * 0.4) return true;
  }
  return false;
}

function extendUncertainRow(seed, boxes, h, top, end, base) {
  const members = [seed];
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of boxes) {
      if (q.shape !== 'text' || members.includes(q) || !q.textConfidence || !compatible(seed, q))
        continue;
      const gap = q.x - end;
      if (gap < -2 || gap > h * 1.25) continue;
      const bridge = {
        x: end,
        y: Math.min(top, q.y),
        w: Math.max(1, gap),
        h: Math.max(base, bottom(q)) - Math.min(top, q.y),
      };
      if (
        boxes.some((b) => ['icon', 'image', 'graphic'].includes(b.shape) && intersects(b, bridge))
      )
        continue;
      members.push(q);
      end = Math.max(end, right(q));
      top = Math.min(top, q.y);
      base = Math.max(base, bottom(q));
      changed = true;
    }
  }
  return { members, top, end, base };
}

function uncertainRowConflict(image, seed, boxes) {
  const h = seed.typeMetrics.xHeight;
  let left = seed.x,
    top = seed.y,
    end = right(seed),
    base = bottom(seed),
    reason = null;
  // A large unresolved owner abutting a row can hide a continuation. Require
  // multiple bright glyph-shaped column groups inside that owner at the row baseline.
  const continuation = unresolvedContinuation(image, seed, boxes, h, left);
  if (continuation !== null) {
    left = continuation;
    reason = 'unresolved-row-overlap';
  }
  // An unclaimed glyph beside a short row and immediately before a tall,
  // differently coloured occluding surface is evidence of a clipped row.
  if (!reason && seed.typeMetrics.glyphs <= 3) {
    const extra = clippedRowGlyph(image, seed, h);
    if (extra) {
      end = right(extra) + 1;
      top = Math.min(top, extra.y - 1);
      base = Math.max(base, bottom(extra) + 1);
      reason = 'clipped-row-conflict';
    }
  }
  // A competing generic claim whose source ink lies inside a short text
  // proposal can split a clipped caption. Require a saturated surface that
  // extends above and below the row at its trailing edge.
  let conflicting = null;
  if (!reason && seed.typeMetrics.glyphs <= 3 && seed.typeMetrics.glyphBounds) {
    const glyph = seed.typeMetrics.glyphBounds;
    conflicting = conflictingRowClaim(image, seed, boxes, h, glyph);
    if (conflicting) {
      left = Math.min(left, conflicting.sourceBounds.x);
      top = Math.min(top, conflicting.sourceBounds.y);
      end = Math.max(end, right(conflicting.sourceBounds));
      base = Math.max(base, bottom(conflicting.sourceBounds));
      reason = 'clipped-row-conflict';
    }
  }
  return { extent: { left, top, end, base }, reason, conflicting };
}
