import { fitsTextFlow } from './structure-fragments.mjs';
import { continuationGlyphParts } from './structure-fragments.mjs';
import {
  joinStructuralGridParts,
  separateStructureLabels,
  collectAttachedStructureSymbols,
  collectStandaloneStructureSymbols,
} from './structure-refinement.mjs';
import {
  bounds,
  unique,
  inkParts,
  confirmedText,
  graphicTopology,
  staggeredGraphic,
} from './structure-topology.mjs';
import { splitTextBands } from './structure-refinement.mjs';
// Separate text decoration from glyph connectivity. The original image stays intact.
export function detachTextUnderlines(mask, width, height) {
  const decorations = [];
  for (let y = 4; y < height - 2; y++) {
    for (let x = 0; x < width;) {
      if (!mask[y * width + x]) {
        x++;
        continue;
      }
      const left = x;
      while (x < width && mask[y * width + x]) x++;
      const right = x,
        length = right - left;
      if (length < 28 || length > width * 0.85) continue;
      let bottom = y;
      while (bottom + 1 < height && bottom - y < 2) {
        let same = 0;
        for (let xx = left; xx < right; xx++) same += !!mask[(bottom + 1) * width + xx];
        if (same < length * 0.9) break;
        bottom++;
      }
      if (bottom - y > 1) continue;
      let below = 0,
        nearAbove = 0,
        occupied = 0,
        transitions = 0,
        previous = false;
      for (let xx = left; xx < right; xx++) {
        let support = 0;
        for (let yy = Math.max(0, y - 13); yy < y; yy++) support += !!mask[yy * width + xx];
        for (let yy = Math.max(0, y - 4); yy < y; yy++) nearAbove += !!mask[yy * width + xx];
        for (let yy = bottom + 1; yy <= Math.min(height - 1, bottom + 3); yy++)
          below += !!mask[yy * width + xx];
        const present = support >= 2;
        occupied += present;
        if (present && !previous) transitions++;
        previous = present;
      }
      let joinedEnds = 0;
      for (const xx of [left, right - 1]) {
        let n = 0;
        for (let yy = y - 4; yy < y; yy++) n += !!mask[yy * width + xx];
        if (n >= 3) joinedEnds++;
      }
      if (
        below > length * 0.08 ||
        nearAbove < length * 0.35 ||
        occupied < length * 0.25 ||
        transitions < 3 ||
        joinedEnds === 2
      )
        continue;
      for (let yy = y; yy <= bottom; yy++) mask.fill(0, yy * width + left, yy * width + right);
      decorations.push({ x: left, y, w: length, h: bottom - y + 1 });
    }
  }
  return decorations;
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const centerY = (b) => b.y + b.h / 2;

// Offset contours overlap in two dimensions; ordinary adjacent glyphs do not.
export function hasLayeredContours(image, box) {
  if (box.w > 88 || box.h > 88 || box.w < 12 || box.h < 12) return false;
  const parts = inkParts(image, box),
    full = parts.length ? bounds(parts) : null;
  if (!full) return false;
  const substantial = parts.filter(
    (p) => p.h >= full.h * 0.4 && p.w >= full.w * 0.4 && p.w / p.h >= 0.55 && p.w / p.h <= 1.8
  );
  return substantial.some((a, i) =>
    substantial.slice(i + 1).some((b) => {
      const dx = Math.abs(a.x - b.x),
        dy = Math.abs(a.y - b.y);
      const overlap =
        Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return (
        dx >= 2 &&
        dy >= 2 &&
        dy >= dx * 0.5 &&
        dy <= dx * 2 &&
        overlap >= Math.min(a.w * a.h, b.w * b.h) * 0.25
      );
    })
  );
}

export function refineTextStructure(image, input, measure) {
  let boxes = input.flatMap((b) => splitTextBands(image, { ...b }, measure));
  for (const box of boxes) {
    if (box.roleEvidence || box.kind === 'control-icon') continue;
    const typography = measure(image, box);
    if (staggeredGraphic(image, box, typography)) {
      box.shape = 'icon';
      box.roleEvidence = 'staggered-graphic';
      continue;
    }
    if (confirmedText(typography) && typography.glyphs >= 3 && box.componentCount >= 3) {
      box.shape = 'text';
      box.typeMetrics = typography;
      continue;
    }
    const topology = graphicTopology(image, box, measure);
    if (topology) {
      box.shape = 'icon';
      box.roleEvidence = topology;
    } else if (hasLayeredContours(image, box)) {
      box.shape = 'icon';
      box.roleEvidence = 'layered-contours';
    }
  }
  boxes = joinStructuralGridParts(image, boxes);
  boxes = separateStructureLabels(image, boxes, measure);
  const result = [],
    possible = [];
  collectAttachedStructureSymbols(image, boxes, measure, fitsTextFlow, possible, result);
  // Independently separated compact marks can use the same local typography
  // evidence as a mark still attached to its label.
  collectStandaloneStructureSymbols(image, boxes, measure, possible, result);
  for (const p of possible) {
    if (p.standalone || p.textEvidence) continue;
    const peers = possible.filter(
      (q) =>
        q !== p &&
        q.large &&
        Math.abs(centerY(q.symbol) - centerY(p.symbol)) <= 6 &&
        Math.abs(q.m.xHeight - p.m.xHeight) <= 3
    );
    if (!p.large && peers.length < 3) continue;
    const index = result.indexOf(p.box);
    if (index >= 0) result.splice(index, 1, p.symbol, p.tail);
  }
  return result;
}
export { inkParts };

export function repairTextFragments(image, input, measure, obstacles = []) {
  const boxes = [...input];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        const parts = continuationGlyphParts(image, a, b, boxes, measure, obstacles);
        if (!parts) continue;
        const x = Math.min(a.x, b.x),
          y = Math.min(a.y, b.y),
          w = Math.max(a.x + a.w, b.x + b.w) - x,
          h = Math.max(a.y + a.h, b.y + b.h) - y;
        const joined = {
          ...a,
          x,
          y,
          w,
          h,
          componentCount: (a.componentCount || 1) + (b.componentCount || 1) + parts.length,
        };
        joined.typeMetrics = measure(image, joined) || a.typeMetrics;
        joined.contrast = Math.max(a.contrast, b.contrast);
        joined.kind = 'text-continuation';
        const remove = new Set([
          a,
          b,
          ...boxes.filter(
            (q) =>
              q.shape === 'unknown' &&
              q.x >= x &&
              q.x + q.w <= x + w &&
              q.y >= y &&
              q.y + q.h <= y + h
          ),
        ]);
        for (let k = boxes.length - 1; k >= 0; k--) if (remove.has(boxes[k])) boxes.splice(k, 1);
        boxes.push(joined);
        changed = true;
        break outer;
      }
  }
  return boxes;
}

export function isDirectionalArrow(image, box) {
  if (box.w < 6 || box.h < 8 || box.w > 20 || box.h > 24) return false;
  let peak = 0;
  for (let y = box.y; y < box.y + box.h; y++)
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * image.width + x) * 4;
      peak = Math.max(peak, ...box.bg.map((v, c) => Math.abs(v - image.data[i + c])));
    }
  const threshold = Math.max(12, peak * 0.3),
    rows = [];
  for (let y = box.y; y < box.y + box.h; y++) {
    const xs = [];
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * image.width + x) * 4;
      if (
        Math.max(
          Math.abs(box.bg[0] - image.data[i]),
          Math.abs(box.bg[1] - image.data[i + 1]),
          Math.abs(box.bg[2] - image.data[i + 2])
        ) > threshold
      )
        xs.push(x);
    }
    if (xs.length) rows.push({ span: xs.at(-1) - xs[0] + 1, center: (xs[0] + xs.at(-1)) / 2 });
  }
  if (rows.length < 8) return false;
  const centers = rows.map((r) => r.center),
    width = Math.max(...rows.map((r) => r.span));
  if (width < 6 || Math.max(...centers) - Math.min(...centers) > Math.max(1.5, width * 0.25))
    return false;
  for (const profile of [rows, [...rows].reverse()]) {
    const peak = profile.findIndex((r) => r.span === width),
      head = profile.slice(peak);
    let stem = 0;
    while (stem < profile.length && profile[stem].span <= Math.max(3, width * 0.3)) stem++;
    if (
      peak < profile.length * 0.3 ||
      peak > profile.length * 0.7 ||
      head.length < 3 ||
      stem < profile.length * 0.3 ||
      stem > peak ||
      peak - stem > Math.max(1, profile.length * 0.15)
    )
      continue;
    if (head.at(-1).span > Math.max(3, width * 0.35) || new Set(head.map((r) => r.span)).size < 3)
      continue;
    if (head.slice(1).every((r, i) => r.span <= head[i].span + 1)) return true;
  }
  return false;
}

// Join overlapping support only beside independently established panel figures.
export function mergeGraphicSupport(image, input, measure) {
  const boxes = input.map((b) => ({ ...b })),
    removed = new Set();
  for (const icon of boxes) {
    if (icon.shape !== 'icon' || icon.w > 36 || icon.h > 36 || icon.kind === 'control-icon')
      continue;
    const peers = boxes.filter(
      (q) =>
        q !== icon &&
        q.shape === 'icon' &&
        q.roleEvidence &&
        Math.abs(centerY(q) - centerY(icon)) <= Math.max(q.h, icon.h) * 0.6 &&
        Math.max(q.x - icon.x - icon.w, icon.x - q.x - q.w, 0) <= icon.h * 3
    );
    if (!peers.length) continue;
    for (const support of boxes) {
      if (
        support === icon ||
        removed.has(support) ||
        support.roleEvidence ||
        !['text', 'unknown'].includes(support.shape) ||
        support.w > 36 ||
        support.h > 36
      )
        continue;
      const m = measure(image, support);
      if (confirmedText(m)) continue;
      const one = inkParts(image, icon),
        two = inkParts(image, support);
      if (!one.length || !two.length) continue;
      const a = bounds(one),
        b = bounds(two),
        overlap =
          Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
          Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      if (overlap < Math.min(a.w * a.h, b.w * b.h) * 0.1) continue;
      const color = (parts) => [0, 1, 2].map((c) => median(parts.map((p) => p.rgb[c]))),
        c1 = color(one),
        c2 = color(two);
      if (Math.max(...c1.map((v, c) => Math.abs(v - c2[c]))) > 30) continue;
      const full = bounds([icon, support]);
      if (full.w > 36 || full.h > 36) continue;
      Object.assign(icon, full, {
        atoms: unique([...one, ...two]),
        shape: 'icon',
        roleEvidence: 'graphic-support',
        componentCount: one.length + two.length,
        sourceBounds: { ...full },
      });
      removed.add(support);
    }
  }
  return boxes.filter((b) => !removed.has(b));
}

// An asymmetric rising tick has a low left shoulder and a taller right arm.
// A normal V has both shoulders at the same height and is not accepted.
export function isCheckMark(image, box) {
  if (
    box.w < 8 ||
    box.h < 6 ||
    box.w > 36 ||
    box.h > 30 ||
    box.w / box.h < 1.15 ||
    box.w / box.h > 2.2
  )
    return false;
  const cols = [];
  for (let x = box.x; x < box.x + box.w; x++) {
    const ys = [];
    for (let y = box.y; y < box.y + box.h; y++) {
      const i = (y * image.width + x) * 4;
      if (
        Math.max(
          Math.abs(box.bg[0] - image.data[i]),
          Math.abs(box.bg[1] - image.data[i + 1]),
          Math.abs(box.bg[2] - image.data[i + 2])
        ) > 60
      )
        ys.push(y - box.y);
    }
    if (ys.length) cols.push({ x: x - box.x, y: median(ys) });
  }
  if (cols.length < box.w * 0.8) return false;
  const peak = Math.max(...cols.map((c) => c.y)),
    valley = cols.findIndex((c) => c.y === peak),
    left = median(cols.slice(0, Math.max(1, Math.floor(cols.length * 0.15))).map((c) => c.y)),
    right = median(cols.slice(-Math.max(1, Math.floor(cols.length * 0.15))).map((c) => c.y));
  if (
    valley < cols.length * 0.18 ||
    valley > cols.length * 0.5 ||
    peak < box.h * 0.65 ||
    left - right < box.h * 0.25 ||
    right > box.h * 0.35 ||
    peak - left < box.h * 0.2
  )
    return false;
  return (
    cols.slice(1, valley + 1).every((c, i) => c.y >= cols[i].y - 1.5) &&
    cols.slice(valley + 1).every((c, i) => c.y <= cols[valley + i].y + 1.5)
  );
}

export { resolveControlPeers, resolveTextBadges } from './structure-fragments.mjs';

export {
  absorbTextMarks,
  resolveTextColumns,
  fitsTextFlow,
  recoverTextFlow,
} from './structure-fragments.mjs';
