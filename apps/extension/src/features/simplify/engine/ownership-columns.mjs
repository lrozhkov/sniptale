import { inkParts } from './structure.mjs';
import { matchingSourceGlyph, sameSourceInk } from './ownership-ink.mjs';

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const sameColor = (a, b) => Math.max(...a.map((v, c) => Math.abs(v - b[c]))) <= 30;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function unclaimedColumnProposal(box, height, protectedRects) {
  return (
    ['icon', 'unknown'].includes(box.shape) &&
    !box.roleEvidence &&
    box.kind !== 'control-icon' &&
    box.w <= height * 1.5 &&
    box.h <= height * 2 &&
    !protectedRects.some((q) => overlaps(q, box))
  );
}

function columnCandidates(image, input, narrow, protectedRects, measure, height) {
  const extras = narrow
    .filter((b) => !input.some((q) => overlaps(q, b)))
    .map((b) => ({ ...b, shape: 'unknown' }));
  const candidates = [],
    seen = new Set();
  for (const box of [...input, ...extras]) {
    if (!unclaimedColumnProposal(box, height, protectedRects)) continue;
    const parts = inkParts(image, { ...(box.sourceBounds || box), bg: box.bg, atoms: null }).filter(
      (p) => p.n >= 5
    );
    if (parts.length !== 1) continue;
    const part = parts[0],
      metric = measure(image, { ...(box.sourceBounds || box), bg: box.bg }, 1);
    if (part.h < 5 || part.w > part.h || !metric || metric.foregroundCoverage < 0.9) continue;
    const key = [part.x, part.y, part.w, part.h].join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ box, part, metric });
  }
  return { candidates, extras };
}

function columnRowPitch(family, rows, height, tolerance) {
  const positions = [
    ...new Set([
      ...family.map((q) => q.part.y),
      ...rows.map((q) => q.box.typeMetrics.glyphBounds.y),
    ]),
  ].sort((a, b) => a - b);
  const gaps = positions
    .slice(1)
    .map((y, i) => y - positions[i])
    .filter((d) => d >= height * 1.5);
  if (gaps.length < 4) return null;
  const pitch = median(gaps);
  if (pitch > height * 6 || gaps.filter((g) => Math.abs(g - pitch) <= tolerance).length < 4)
    return null;
  return pitch;
}

function columnFamily(image, seed, candidates, anchors) {
  const { part, metric } = seed,
    tolerance = Math.max(1, metric.stroke * 2);
  const family = candidates.filter(
    (q) =>
      Math.abs(q.part.x - part.x) <= tolerance &&
      Math.abs(q.part.h - part.h) <= Math.max(1, part.h * 0.1) &&
      sameSourceInk(q.part.rgb, part.rgb, q.box.bg, seed.box.bg) &&
      sameColor(q.box.bg, seed.box.bg)
  );
  const rows = anchors.filter(
    (q) =>
      Math.abs(q.box.x - seed.box.x) <= tolerance &&
      Math.min(q.box.typeMetrics.xHeight, part.h) >=
        Math.max(q.box.typeMetrics.xHeight, part.h) * 0.75 &&
      sameColor(q.box.bg, seed.box.bg)
  );
  if (family.length < 4 || rows.length < 2) return null;
  const witnesses = family.filter(
    (q) =>
      rows.filter((r) =>
        r.parts.some((p) => matchingSourceGlyph(image, q.part, p, q.box.bg, r.box.bg))
      ).length >= 2
  );
  if (witnesses.length < 3) return null;
  const inferFont = witnesses.some(
    (q) => !matchingSourceGlyph(image, q.part, witnesses[0].part, q.box.bg, witnesses[0].box.bg)
  );
  const pitch = columnRowPitch(family, rows, part.h, tolerance);
  return pitch === null
    ? null
    : { family, anchor: rows[0].box, pitch, tolerance, inferFont, witnesses };
}

function columnText(box, part, metric, anchor) {
  const result = {
    ...box,
    shape: 'text',
    kind: 'column-text',
    roleEvidence: 'text-column',
    typeMetrics: {
      ...metric,
      glyphs: 1,
      xHeight: part.h,
      upperHeight: part.h,
      glyphBounds: { x: part.x, y: part.y, w: part.w, h: part.h },
      baselineAgreement: 1,
      heightAgreement: 1,
    },
    textConfidence: true,
    textSize: anchor.textSize,
    textCenterY: part.y + part.h / 2,
    contrast: metric.foregroundContrast,
  };
  for (const key of [
    'sourceBounds',
    'sourceRuns',
    'iconSize',
    'atoms',
    'eraseRuns',
    'erasePlane',
    'eraseLayers',
    'eraseFragments',
  ])
    delete result[key];
  return result;
}

/** A supported text-column font can own compact values even when an individual glyph is fragmented. */
export function recoverColumnGlyphs(image, input, narrow, protectedRects, measure) {
  const anchors = input
    .filter(
      (b) =>
        b.shape === 'text' &&
        b.textConfidence &&
        b.typeMetrics?.glyphs >= 3 &&
        b.typeMetrics.glyphBounds &&
        b.w >= b.typeMetrics.xHeight * 3
    )
    .map((box) => ({
      box,
      parts: inkParts(image, { ...box, atoms: null }).filter((p) => p.n >= 5),
    }));
  if (anchors.length < 2) return input;
  const height = Math.max(...anchors.map((q) => q.box.typeMetrics.xHeight));
  const { candidates, extras } = columnCandidates(
    image,
    input,
    narrow,
    protectedRects,
    measure,
    height
  );
  const accepted = new Map();
  for (const seed of candidates) {
    const group = columnFamily(image, seed, candidates, anchors);
    if (!group) continue;
    const { family, anchor, pitch, tolerance, inferFont, witnesses } = group;
    for (const q of family) {
      if (!inferFont && !witnesses.includes(q)) continue;
      const distance = Math.abs(q.part.y - anchor.typeMetrics.glyphBounds.y),
        ratio = q.metric.stroke / anchor.typeMetrics.stroke;
      if (
        distance > pitch * 6 ||
        Math.abs(distance - Math.round(distance / pitch) * pitch) > tolerance ||
        ratio < 0.6 ||
        ratio > 1.6
      )
        continue;
      accepted.set(q.box, columnText(q.box, q.part, q.metric, anchor));
    }
  }
  return [
    ...input.map((b) => accepted.get(b) || b),
    ...extras.filter((b) => accepted.has(b)).map((b) => accepted.get(b)),
  ];
}
