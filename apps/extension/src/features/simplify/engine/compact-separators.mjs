import { inkParts } from './structure.mjs';
import { intersect } from './compact-contours.mjs';

// Require a repeated, lower-contrast separator between three independent labels.
// This context distinguishes the marks from angle operators in ordinary text.
export function splitRepeatedChevron(image, box, input, measure, protectedRects) {
  if (box.shape !== 'text' || !box.textConfidence || box.textDecorations) return null;
  // Proposals can merge any number of captions and separators. Follow adjacent
  // same-row proposals and inspect their original connected components instead.
  const chain = adjacentCaptionChain(box, input);
  if (!chain) return null;
  const members = chain
    .flatMap((owner) => inkParts(image, { ...owner, atoms: null }).map((p) => ({ p, owner })))
    .sort((a, b) => a.p.x - b.p.x);
  const pix = (q, x, y) => {
    const i = ((q.y + y) * image.width + q.x + x) * 4;
    return Math.max(...box.bg.map((v, c) => Math.abs(v - image.data[i + c])));
  };
  const isChevron = (q) =>
    q.w >= 3 &&
    q.h >= 5 &&
    q.w <= 30 &&
    q.h <= 30 &&
    (q.w <= q.h * 0.75 || q.h <= q.w * 0.75) &&
    [false, true].some((v) => [false, true].some((r) => chevronProfile(q, pix, v, r)));
  const marks = members.map((o, i) => (isChevron(o.p) ? i : -1)).filter((i) => i >= 0);
  for (const i of marks)
    for (const j of marks) {
      if (j <= i) continue;
      const p = members[i].p;
      if (i === 0 || j === i + 1 || j === members.length - 1) continue;
      let peak = 0;
      const matches = (q) => {
        if (
          Math.abs(p.w - q.w) > Math.max(1, p.w * 0.15) ||
          Math.abs(p.h - q.h) > Math.max(1, p.h * 0.15) ||
          Math.abs(p.y - q.y) > 1
        )
          return false;
        const result = chevronMaskMatch(p, q, pix);
        peak = Math.max(peak, result.peak);
        return result.match;
      };
      if (!matches(members[j].p)) continue;
      const selected = extendSeparatorSequence(members, marks, i, j, matches);
      if (!separatorSpacing(members, selected)) continue;
      const ownership = separatorClaimOwners(chain, members, selected);
      if (!ownership) continue;
      const { owners, right, lastOwner } = ownership;
      // Never consume a later repeated mark inside the last caption proposal.
      if (
        marks.some(
          (k) => k > selected.at(-1) && members[k].owner === lastOwner && matches(members[k].p)
        )
      )
        continue;
      if (
        selected.some(
          (k) =>
            protectedRects.some((r) => intersect(members[k].p, r)) ||
            input.some((r) => !owners.includes(r) && intersect(members[k].p, r))
        )
      )
        continue;
      const labels = separatorCaptions(image, box, owners, members, selected, right, measure, peak);
      if (labels.length !== selected.length + 1) continue;
      return {
        boxes: [...labels, ...selected.map((k) => separatorIcon(members[k].p, members[k].owner))],
        owners,
      };
    }
  return null;
}

function adjacentCaptionChain(box, input) {
  const cy = box.y + box.h / 2,
    unit = box.h;
  const row = input
    .filter(
      (q) =>
        ['text', 'unknown', 'icon'].includes(q.shape) &&
        q.kind !== 'control-icon' &&
        q.bg &&
        !q.textDecorations &&
        Math.abs(q.y + q.h / 2 - cy) <= unit * 0.5 &&
        q.h >= unit * 0.55 &&
        q.h <= unit * 1.8 &&
        q.x + q.w >= box.x
    )
    .sort((a, b) => a.x - b.x);
  if (row[0] !== box) return null;
  const chain = [box];
  for (const q of row.slice(1)) {
    const last = chain.at(-1);
    if (q.x - (last.x + last.w) > unit * 1.8) break;
    if (q.x < last.x + last.w - 2) break;
    chain.push(q);
  }
  return chain;
}

function chevronProfile(q, pix, vertical, reverse) {
  const length = vertical ? q.w : q.h,
    breadth = vertical ? q.h : q.w,
    centers = [];
  for (let a = 0; a < length; a++) {
    const v = [];
    for (let b = 0; b < breadth; b++) if ((vertical ? pix(q, a, b) : pix(q, b, a)) > 40) v.push(b);
    if (!v.length) return false;
    centers.push((v[0] + v.at(-1)) / 2);
  }
  const c = reverse ? centers.map((n) => breadth - 1 - n) : centers,
    mid = Math.floor(length / 2),
    edge = (c[0] + c.at(-1)) / 2;
  return (
    c[mid] - edge >= Math.max(1, breadth * 0.35) &&
    Math.abs(c[0] - c.at(-1)) <= Math.max(1, breadth * 0.25) &&
    c.slice(1, mid + 1).every((n, i) => n >= c[i] - 1) &&
    c.slice(mid + 1).every((n, i) => n <= c[mid + i] + 1)
  );
}

function extendSeparatorSequence(members, marks, i, j, matches) {
  const p = members[i].p;
  const selected = [i, j];
  for (const k of marks) {
    if (k <= j || k === members.length - 1 || !matches(members[k].p)) continue;
    const prev = selected.at(-1),
      between = members.slice(prev + 1, k);
    if (!between.length) continue;
    const prior = members[prev].p,
      next = members[k].p,
      first = Math.min(...between.map((o) => o.p.x)),
      last = Math.max(...between.map((o) => o.p.x + o.p.w)),
      limit = Math.max(p.w, p.h) * 1.5;
    if (
      first - prior.x - prior.w < 2 ||
      first - prior.x - prior.w > limit ||
      next.x - last < 2 ||
      next.x - last > limit
    )
      break;
    selected.push(k);
  }
  return selected;
}

function separatorSpacing(members, selected) {
  const i = selected[0],
    p = members[i].p;
  const first = members[selected[0]].p,
    last = members[selected.at(-1)].p;
  const preceding = members.slice(0, i),
    following = members.slice(selected.at(-1) + 1);
  const leftEnd = Math.max(...preceding.map((o) => o.p.x + o.p.w)),
    rightStart = Math.min(...following.map((o) => o.p.x));
  const limit = Math.max(p.w, p.h) * 1.5;
  if (
    first.x - leftEnd < Math.max(2, p.w * 0.5) ||
    first.x - leftEnd > limit ||
    rightStart - (last.x + last.w) < 2 ||
    rightStart - (last.x + last.w) > limit
  )
    return false;
  let valid = true;
  for (let n = 1; n < selected.length; n++) {
    const a = members[selected[n - 1]].p,
      b = members[selected[n]].p,
      between = members.slice(selected[n - 1] + 1, selected[n]);
    if (!between.length) {
      valid = false;
      break;
    }
    const start = Math.min(...between.map((o) => o.p.x)),
      end = Math.max(...between.map((o) => o.p.x + o.p.w));
    if (start - a.x - a.w < 2 || start - a.x - a.w > limit || b.x - end < 2 || b.x - end > limit) {
      valid = false;
      break;
    }
  }
  if (!valid) return false;
  return true;
}

function separatorCaptions(image, box, owners, members, selected, right, measure, peak) {
  const p = members[selected[0]].p;
  const spans = [];
  let start = box.x;
  for (const k of selected) {
    const mark = members[k].p;
    spans.push([start, mark.x - 1]);
    start = mark.x + mark.w + 1;
  }
  spans.push([start, right]);
  const labels = [];
  for (const [start, stop] of spans) {
    const caption = measureSeparatorCaption(image, box, owners, start, stop, measure, peak, p);
    if (!caption) {
      labels.length = 0;
      break;
    }
    labels.push(caption);
  }
  return labels;
}

function separatorIcon(part, base) {
  const sourceBounds = { x: part.x - 1, y: part.y - 1, w: part.w + 2, h: part.h + 2 };
  return {
    ...sourceBounds,
    bg: base.bg,
    contrast: base.contrast,
    shape: 'icon',
    kind: 'compact-graphic',
    compact: true,
    roleEvidence: 'repeated-chevron-separator',
    iconSize: Math.min(part.w, part.h),
    sourceBounds,
    atoms: [part],
  };
}

function chevronMaskMatch(p, q, pix) {
  let peak = 0;
  let mismatch = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const a = pix(p, x, y),
        b = pix(
          q,
          Math.min(q.w - 1, Math.floor(((x + 0.5) * q.w) / p.w)),
          Math.min(q.h - 1, Math.floor(((y + 0.5) * q.h) / p.h))
        );
      peak = Math.max(peak, a, b);
      if (a > 40 !== b > 40) mismatch++;
    }
  return { match: mismatch <= p.w * p.h * 0.25, peak };
}

function measureSeparatorCaption(image, box, owners, start, stop, measure, peak, p) {
  const base = {
    ...box,
    x: start,
    w: stop - start,
    y: Math.min(...owners.map((o) => o.y)),
    h: Math.max(...owners.map((o) => o.y + o.h)) - Math.min(...owners.map((o) => o.y)),
  };
  const m = measure(image, base);
  if (
    !m ||
    m.glyphs < 2 ||
    (m.glyphs === 2 && m.glyphBounds?.w < m.xHeight * 2.5) ||
    m.baselineAgreement < 0.7 ||
    m.heightAgreement < 0.7 ||
    !m.glyphBounds ||
    peak > m.foregroundContrast * 0.8 ||
    Math.max(p.w, p.h) < m.xHeight * 0.7 ||
    Math.max(p.w, p.h) > m.xHeight * 1.8
  ) {
    return null;
  }
  const left = Math.max(start, m.glyphBounds.x - 2),
    end = Math.min(stop, m.glyphBounds.x + m.glyphBounds.w + 2);
  base.x = left;
  base.w = end - left;
  const fragments = owners
    .flatMap((o) => o.eraseFragments || [])
    .filter((f) => f.x < end && f.x + f.w > left)
    .map((f) => ({
      x: Math.max(left, f.x),
      y: f.y,
      w: Math.min(end, f.x + f.w) - Math.max(left, f.x),
      h: f.h,
      bg: f.bg,
      surfaceClip: f.surfaceClip,
    }));
  for (const key of [
    'sourceBounds',
    'sourceRuns',
    'eraseRuns',
    'erasePlane',
    'eraseFragments',
    'eraseLayers',
    'atoms',
    'textCenterY',
    'rowTextSize',
    'textSize',
    'typeMetrics',
    'textConfidence',
    'textDecorations',
    'roleEvidence',
  ])
    delete base[key];
  if (fragments.length) base.eraseFragments = fragments;
  base.typeMetrics = m;
  base.textConfidence = true;
  base.textCenterY = m.glyphBounds.y + m.glyphBounds.h / 2;
  base.textSize = Math.max(4, 2 * Math.round(m.xHeight * 0.8));
  return base;
}

function separatorClaimOwners(chain, members, selected) {
  const following = members.slice(selected.at(-1) + 1);
  const lastOwner = following[0].owner,
    end = chain.indexOf(lastOwner);
  if (end < 0) return null;
  const owners = chain.slice(0, end + 1),
    right = lastOwner.x + lastOwner.w,
    selectedOwners = new Set(selected.map((k) => members[k].owner));
  if (owners.some((o) => ['unknown', 'icon'].includes(o.shape) && !selectedOwners.has(o)))
    return null;
  if (owners.some((o) => o.shape === 'icon' && members.filter((m) => m.owner === o).length !== 1))
    return null;
  return { owners, right, lastOwner };
}
