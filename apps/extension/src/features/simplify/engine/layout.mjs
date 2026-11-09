import { intersects, centerX, centerY, median } from './structure-topology.mjs';
import {
  columnRuns,
  textBands,
  boundsFromRuns,
  inlineSymbolEdge,
  inlineToolbarSlots,
} from './layout-inline.mjs';
import { compact, markRepeatedIcons, recoverMediaPeer } from './layout-peers.mjs';
import { inkParts, isDirectionalArrow } from './structure.mjs';
// Refine already detected regions using local geometry and repeated visual peers.
// Rectangle coordinates use image pixels. Inputs are never mutated.

function clipText(box, obstacles) {
  let result = { ...box };
  for (const obstacle of obstacles) {
    if (!intersects(result, obstacle)) continue;
    const left = Math.max(0, obstacle.x - result.x);
    const right = Math.max(0, result.x + result.w - (obstacle.x + obstacle.w));
    // A horizontal exclusion can only retain one supported side. A box fully
    // inside an exclusion is removed rather than painting over that control.
    if (Math.max(left, right) < 4) return null;
    if (left >= right) result.w = left;
    else {
      result.x = obstacle.x + obstacle.w;
      result.w = right;
    }
  }
  return result;
}
function separator(image, a, b) {
  const left = a.x <= b.x ? a : b,
    right = left === a ? b : a;
  const start = Math.ceil(left.x + left.w),
    end = Math.floor(right.x);
  const top = Math.max(0, Math.ceil(Math.max(a.y, b.y))),
    bottom = Math.min(image.height, Math.floor(Math.min(a.y + a.h, b.y + b.h)));
  if (end <= start || bottom - top < 6 || !image.data || !a.bg) return false;
  for (let x = start; x < end; x++) {
    let ink = 0;
    for (let y = top; y < bottom; y++) {
      const i = (y * image.width + x) * 4;
      if (Math.max(...a.bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 35) ink++;
    }
    if (ink / (bottom - top) > 0.65) return true;
  }
  return false;
}
function crosses(a, b, obstacles) {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y),
    r = Math.max(a.x + a.w, b.x + b.w),
    bottom = Math.max(a.y + a.h, b.y + b.h);
  return obstacles.some((o) => intersects({ x, y, w: r - x, h: bottom - y }, o));
}
function foregroundColor(image, b) {
  if (!image.data || !b.bg) return null;
  const values = [[], [], []];
  for (let y = Math.max(0, Math.ceil(b.y)); y < Math.min(image.height, Math.floor(b.y + b.h)); y++)
    for (
      let x = Math.max(0, Math.ceil(b.x));
      x < Math.min(image.width, Math.floor(b.x + b.w));
      x++
    ) {
      const i = (y * image.width + x) * 4;
      if (Math.max(...b.bg.map((v, c) => Math.abs(v - image.data[i + c]))) <= 40) continue;
      for (let c = 0; c < 3; c++) values[c].push(image.data[i + c]);
    }
  return values[0].length >= 4 ? values.map(median) : null;
}
export function stabilizeLayout(
  image,
  input,
  { boundaries = [], protected: protectedRects = [], media = [], measure } = {}
) {
  const frames = boundaries.filter((b) => b.kind !== 'separator');
  const obstacles = [...boundaries.filter((b) => b.kind === 'separator'), ...protectedRects];
  let boxes = input
    .map((b) => (b.shape === 'text' ? clipText(b, obstacles) : { ...b }))
    .filter(Boolean);
  // A container constrains its children; mere intersection cannot erase a line.
  const frameMembership = (b) =>
    frames
      .map((f, i) =>
        b.x >= f.x && b.y >= f.y && b.x + b.w <= f.x + f.w && b.y + b.h <= f.y + f.h ? i : -1
      )
      .filter((i) => i >= 0)
      .join(',');
  boxes.push(...recoverMediaPeer(image, boxes, media, obstacles));
  markRepeatedIcons(image, boxes, measure);
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        if (!canJoinLayoutRows(image, a, b, frameMembership, obstacles)) continue;
        const x = Math.min(a.x, b.x),
          y = Math.min(a.y, b.y),
          right = Math.max(a.x + a.w, b.x + b.w),
          bottom = Math.max(a.y + a.h, b.y + b.h);
        boxes[i] = {
          ...a,
          x,
          y,
          w: right - x,
          h: bottom - y,
          componentCount: (a.componentCount || 1) + (b.componentCount || 1),
          textCenterY: (centerY(a) + centerY(b)) / 2,
        };
        delete boxes[i].typeMetrics;
        delete boxes[i].contrast;
        boxes.splice(j, 1);
        changed = true;
        break outer;
      }
  }
  return boxes;
}

// Recover inline symbols only where foreground pixels establish a real gutter
// and independent shape evidence. The residual label stays text-owned.
export function separateInlineSymbols(image, input, options = {}) {
  if (!image?.data) return input.map((b) => ({ ...b }));
  const obstacles = [
    ...(options.protected || []),
    ...(options.boundaries || []).filter((b) => b.kind === 'separator'),
  ];
  const result = [];
  for (const original of input) {
    const b = { ...original };
    if (
      b.shape === 'image' ||
      b.roleEvidence ||
      b.w < 24 ||
      b.h < 8 ||
      b.w > 500 ||
      b.h > 80 ||
      !b.bg
    ) {
      result.push(b);
      continue;
    }
    const runs = columnRuns(image, b);
    if (runs.length < 2) {
      result.push(b);
      continue;
    }
    // A neighboring confirmed icon supports a row of equally spaced compact
    // slots. Without that independent evidence, spaced letters remain text.
    const slots = inlineToolbarSlots(image, original, b, input, runs, obstacles);
    if (slots) {
      result.push(...slots);
      continue;
    }
    const { first, last } = inlineLabelRunRange(image, b, original, input, options, runs);
    if (first === 0 && last === runs.length - 1) {
      result.push(b);
      continue;
    }
    const symbols = [];
    if (first > 0) symbols.push(boundsFromRuns(b, [runs[0]], 'icon'));
    if (last < runs.length - 1) symbols.push(boundsFromRuns(b, [runs.at(-1)], 'icon'));
    const label = boundsFromRuns(b, runs.slice(first, last + 1), 'text');
    identifyInlineDirections(image, label, symbols, options.measure);
    if (symbols.some((s) => obstacles.some((o) => intersects(s, o)))) {
      result.push(b);
      continue;
    }
    result.push(...symbols, ...textBands(image, label));
  }
  return result;
}

export function reconcileIconPeers(image, boxes, measure, protectedRects = []) {
  const confirmed = boxes.filter((b) => b.shape === 'icon' && b.roleEvidence);
  const neighboringIcons = boxes.filter((b) => b.shape === 'icon');
  return boxes.map((b) => {
    if (
      b.shape !== 'unknown' ||
      b.roleEvidence ||
      !compact(b) ||
      textLike(b) ||
      protectedRects.some((p) => intersects(p, b))
    )
      return b;
    const signature = sourceSignature(b);
    const neighbor = (p) =>
      neighboringIcons.some(
        (q) =>
          q !== p &&
          q.bg &&
          Math.max(...p.bg.map((v, k) => Math.abs(v - q.bg[k]))) <= 12 &&
          Math.abs(centerY(q) - centerY(p)) <= Math.max(3, Math.min(p.h, q.h) * 0.3) &&
          Math.min(p.h, q.h) >= Math.max(p.h, q.h) * 0.6 &&
          Math.max(q.x - p.x - p.w, p.x - q.x - q.w) >= 0 &&
          Math.max(q.x - p.x - p.w, p.x - q.x - q.w) <= Math.max(p.h, q.h) * 2
      );
    const peer =
      confirmed.find((q) => compact(q) && sameSource(signature, sourceSignature(q))) ||
      (neighbor(b) &&
        boxes.find(
          (q) =>
            q !== b &&
            q.shape === 'unknown' &&
            !q.roleEvidence &&
            compact(q) &&
            !textLike(q) &&
            neighbor(q) &&
            Math.hypot(centerX(q) - centerX(b), centerY(q) - centerY(b)) > Math.max(b.w, b.h) * 2 &&
            sameSource(signature, sourceSignature(q))
        ));
    return peer
      ? {
          ...b,
          shape: 'icon',
          roleEvidence: 'confirmed-icon-peer',
          iconSize: peer.iconSize || Math.min(b.w, b.h) - 4,
        }
      : b;
  });
  function textLike(b) {
    const m = measure(image, b);
    return (
      m &&
      m.glyphs >= 2 &&
      m.baselineAgreement >= 0.7 &&
      m.heightAgreement >= 0.7 &&
      m.stroke / m.xHeight <= 0.4
    );
  }
  function sourceSignature(b) {
    const parts = inkParts(image, { ...b, atoms: null });
    if (!parts.length) return null;
    const x = Math.min(...parts.map((p) => p.x)),
      y = Math.min(...parts.map((p) => p.y)),
      w = Math.max(...parts.map((p) => p.x + p.w)) - x,
      h = Math.max(...parts.map((p) => p.y + p.h)) - y,
      bits = [];
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const i = ((y + yy) * image.width + x + xx) * 4;
        bits.push(Math.max(...b.bg.map((v, k) => Math.abs(v - image.data[i + k]))) > 40);
      }
    return { w, h, bits };
  }
  function sameSource(a, b) {
    if (!a || !b || Math.abs(a.w - b.w) > 1 || Math.abs(a.h - b.h) > 1) return false;
    // One raster pixel can change edge thickness, but not row connectivity.
    // Compare occupied runs and their span in both axes before transferring a role.
    for (const transpose of [false, true]) {
      const length = transpose ? a.w : a.h,
        otherLength = transpose ? b.w : b.h;
      for (let row = 0; row < length; row++) {
        const profile = (s, r) => {
          const n = transpose ? s.h : s.w,
            values = [];
          let runs = 0,
            active = false;
          for (let col = 0; col < n; col++) {
            const ink = transpose ? s.bits[col * s.w + r] : s.bits[r * s.w + col];
            if (ink) {
              values.push(col);
              if (!active) runs++;
            }
            active = ink;
          }
          return { runs, n: values.length, first: values[0] ?? 0, last: values.at(-1) ?? 0 };
        };
        const aa = profile(a, row),
          bb = profile(
            b,
            Math.min(otherLength - 1, Math.floor(((row + 0.5) * otherLength) / length))
          );
        if (
          aa.runs !== bb.runs ||
          Math.abs(aa.n - bb.n) > 2 ||
          Math.abs(aa.first - bb.first) > 1 ||
          Math.abs(aa.last - bb.last) > 2
        )
          return false;
      }
    }
    return a.bits.filter(Boolean).length >= 8;
  }
}

function canJoinLayoutRows(image, a, b, frameMembership, obstacles) {
  if (
    a.shape !== 'text' ||
    b.shape !== 'text' ||
    (a.structureGroup !== b.structureGroup && (a.structureGroup || b.structureGroup))
  )
    return false;
  const gap = Math.max(a.x - b.x - b.w, b.x - a.x - a.w, 0),
    h = Math.min(a.h, b.h);
  if (
    Math.abs(centerY(a) - centerY(b)) > h * 0.24 ||
    h < Math.max(a.h, b.h) * 0.7 ||
    gap > Math.max(2, h * 0.25)
  )
    return false;
  if (
    (a.componentCount || 1) < 3 ||
    (b.componentCount || 1) < 3 ||
    frameMembership(a) !== frameMembership(b) ||
    crosses(a, b, obstacles) ||
    separator(image, a, b)
  )
    return false;
  if (a.bg && b.bg && Math.max(...a.bg.map((v, c) => Math.abs(v - b.bg[c]))) > 20) return false;
  const colorA = foregroundColor(image, a),
    colorB = foregroundColor(image, b);
  if (
    colorA &&
    colorB &&
    Math.min(a.h, b.h) < Math.max(a.h, b.h) * 0.85 &&
    Math.max(...colorA.map((v, c) => Math.abs(v - colorB[c]))) > 45
  )
    return false;
  return true;
}

function identifyInlineDirections(image, label, symbols, measure) {
  const labelMetrics = measure?.(image, label),
    labelColor = foregroundColor(image, label);
  if (
    labelMetrics &&
    labelMetrics.glyphs >= 2 &&
    labelMetrics.glyphs <= 5 &&
    labelMetrics.baselineAgreement >= 0.7 &&
    labelMetrics.heightAgreement >= 0.7 &&
    labelColor
  ) {
    for (const symbol of symbols) {
      const color = foregroundColor(image, symbol);
      if (
        color &&
        Math.max(...color) - Math.min(...color) >= 40 &&
        Math.max(...color.map((v, c) => Math.abs(v - labelColor[c]))) <= 32 &&
        isDirectionalArrow(image, symbol)
      ) {
        symbol.shape = 'icon';
        symbol.kind = 'direction-symbol';
        symbol.roleEvidence = 'direction-symbol';
      }
    }
  }
}

function inlineLabelRunRange(image, b, original, input, options, runs) {
  let first = 0,
    last = runs.length - 1;
  if (
    inlineSymbolEdge(image, b, original, input, options, {
      edge: runs[first],
      neighbor: runs[first + 1],
      others: runs.slice(first + 1),
      side: 'left',
    })
  )
    first++;
  if (
    last > first &&
    inlineSymbolEdge(image, b, original, input, options, {
      edge: runs[last],
      neighbor: runs[last - 1],
      others: runs.slice(first, last),
      side: 'right',
    })
  )
    last--;
  return { first, last };
}
