import {
  bounds,
  inkParts,
  partBox,
  sortedRuns,
  confirmedText,
  rectangularGrid,
  opposedStrokes,
} from './structure-topology.mjs';
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const centerY = (b) => b.y + b.h / 2;
function hasTextEvidence(image, box, measure, input = []) {
  const m = measure(image, box, 1);
  if (!confirmedText(m)) return false;
  if (m.glyphs >= 3 || (m.glyphs >= 2 && box.w / box.h > 1.25)) return true;
  // A wide connected stroke can be either a drawing or joined letters. Only
  // actual word spacing to independently measured text supplies the latter proof.
  if (m.glyphs !== 1 || box.w / box.h <= 1.25 || !m.glyphBounds) return false;
  for (const q of input) {
    if (q.shape !== 'text' || q.x >= box.x || q.x + q.w < box.x - 3 || q.x + q.w > box.x + 2)
      continue;
    const peer = measure(image, q);
    if (!confirmedText(peer) || peer.glyphs < 3 || !peer.glyphBounds) continue;
    if (
      Math.min(m.xHeight, peer.xHeight) < Math.max(m.xHeight, peer.xHeight) * 0.6 ||
      Math.min(m.stroke, peer.stroke) < Math.max(m.stroke, peer.stroke) * 0.6
    )
      continue;
    const gap = m.glyphBounds.x - peer.glyphBounds.x - peer.glyphBounds.w;
    if (gap < 0 || gap > Math.max(2, Math.ceil(Math.min(m.stroke, peer.stroke)))) continue;
    const baseline = Math.abs(
      m.glyphBounds.y + m.glyphBounds.h - peer.glyphBounds.y - peer.glyphBounds.h
    );
    if (baseline <= Math.max(2, Math.round(Math.min(m.xHeight, peer.xHeight) * 0.4))) return true;
  }
  return false;
}

function styleBoundary(image, box, parts, measure) {
  const ordered = [...parts].sort((a, b) => a.x - b.x);
  for (let i = 3; i <= ordered.length - 3; i++) {
    const left = ordered.slice(0, i),
      right = ordered.slice(i),
      a = bounds(left),
      b = bounds(right);
    if (b.x - a.x - a.w < 3) continue;
    if (Math.max(...ordered[i - 1].rgb.map((v, c) => Math.abs(v - ordered[i].rgb[c]))) < 35)
      continue;
    const m1 = measure(image, partBox(box, left)),
      m2 = measure(image, partBox(box, right));
    if (!confirmedText(m1) || !confirmedText(m2) || m1.glyphs < 3 || m2.glyphs < 3) continue;
    const h1 = m1.xHeight,
      h2 = m2.xHeight;
    if (!h1 || !h2 || Math.max(h1, h2) < Math.min(h1, h2) * 1.28) continue;
    const c1 = [0, 1, 2].map((c) => median(left.map((p) => p.rgb?.[c] ?? 0))),
      c2 = [0, 1, 2].map((c) => median(right.map((p) => p.rgb?.[c] ?? 0)));
    if (Math.max(...c1.map((v, c) => Math.abs(v - c2[c]))) < 35) continue;
    return [left, right];
  }
  return [parts];
}

function splitSpacedLabels(image, box, parts, input, measure) {
  if (box.h > 24 || box.w > 500 || parts.length < 8) return [parts];
  const m = measure(image, box);
  if (!m) return [parts];
  // Repeated neighboring lines establish paragraph flow. Their word spaces
  // remain inside the line even when the text has several wide gaps.
  const paragraph = input.some(
    (q) =>
      q !== box &&
      q.w > box.w * 0.65 &&
      q.h >= box.h * 0.75 &&
      q.h <= box.h * 1.3 &&
      Math.min(q.x + q.w, box.x + box.w) - Math.max(q.x, box.x) >= Math.min(q.w, box.w) * 0.5 &&
      Math.abs(centerY(q) - centerY(box)) >= box.h * 0.8 &&
      Math.abs(centerY(q) - centerY(box)) <= box.h * 2.2
  );
  if (paragraph) return [parts];
  const runs = sortedRuns(parts),
    gaps = runs.slice(1).map((r, i) => ({ i: i + 1, gap: r.x - runs[i].right }));
  const wordGaps = gaps
    .filter((g) => g.gap >= Math.max(3, m.xHeight * 0.3))
    .map((g) => g.gap)
    .sort((a, b) => a - b);
  if (wordGaps.length < 3) return [parts];
  const small = median(wordGaps.slice(0, Math.ceil(wordGaps.length / 2)));
  const cuts = gaps.filter((g) => g.gap >= Math.max(m.xHeight * 0.7, small * 1.6)).map((g) => g.i);
  if (cuts.length < 2) return [parts];
  const groups = [];
  let start = 0;
  for (const end of [...cuts, runs.length]) {
    groups.push(runs.slice(start, end).flatMap((r) => r.parts));
    start = end;
  }
  if (
    groups.some(
      (g) => g.length < 2 || bounds(g).w < 12 || !confirmedText(measure(image, partBox(box, g)))
    )
  )
    return [parts];
  return groups;
}

function splitVerticalSeparators(image, box, parts, input, measure) {
  if (box.h > 40 || box.w < 60 || parts.length < 6) return null;
  const typical = median(parts.filter((p) => p.w > 3 && p.h >= 4).map((p) => p.h));
  if (!typical) return null;
  const baseline = median(
    parts.filter((p) => p.w > 3 && p.h >= typical * 0.75).map((p) => p.y + p.h)
  );
  const separators = parts.filter(
    (p) =>
      p.w <= Math.max(3, p.h * 0.25) &&
      p.h >= typical * 1.25 &&
      p.y + p.h >= baseline + Math.max(2, typical * 0.15) &&
      p.n / (p.w * p.h) >= 0.75 &&
      !parts.some((q) => q !== p && q.x < p.x + p.w + 3 && q.x + q.w > p.x - 3)
  );
  if (separators.length < 2) return null;
  const height = median(separators.map((p) => p.h)),
    top = median(separators.map((p) => p.y));
  const peers = separators
    .filter((p) => Math.abs(p.h - height) <= Math.max(1, height * 0.1) && Math.abs(p.y - top) <= 1)
    .sort((a, b) => a.x - b.x);
  if (peers.length < 2) return null;
  const paragraph = input.some(
    (q) =>
      q !== box &&
      q.w >= box.w * 0.5 &&
      Math.abs(centerY(q) - centerY(box)) >= box.h * 0.8 &&
      Math.abs(centerY(q) - centerY(box)) <= box.h * 2.2 &&
      Math.min(q.x + q.w, box.x + box.w) - Math.max(q.x, box.x) >= Math.min(q.w, box.w) * 0.5
  );
  if (paragraph) return null;
  const chunks = [];
  let start = -Infinity;
  for (const end of [...peers.map((p) => p.x), Infinity]) {
    const group = parts.filter((p) => p.x >= start && p.x + p.w <= end && !peers.includes(p));
    if (group.length) chunks.push(group);
    const divider = peers.find((p) => p.x === end);
    start = divider ? divider.x + divider.w : end;
  }
  if (chunks.length < 2 || chunks.some((g) => !confirmedText(measure(image, partBox(box, g)))))
    return null;
  const text = chunks.map((g, i) =>
    partBox(box, g, `separated:${box.x}:${box.y}:${i}`, 'text', true)
  );
  return [
    ...text,
    ...peers.map((p) => ({
      ...partBox(box, [p], undefined, 'unknown'),
      roleEvidence: 'separator',
    })),
  ];
}

export function splitTextBands(image, box, measure) {
  if (
    box.shape !== 'text' ||
    box.roleEvidence ||
    box.kind === 'control-icon' ||
    box.h < 18 ||
    box.h > 65 ||
    box.w < box.h * 2
  )
    return [box];
  const bands = [];
  let active = null;
  for (let y = Math.max(0, box.y); y < Math.min(image.height, box.y + box.h); y++) {
    let ink = 0;
    for (let x = Math.max(0, box.x); x < Math.min(image.width, box.x + box.w); x++) {
      const i = (y * image.width + x) * 4;
      if (
        Math.max(
          Math.abs(box.bg[0] - image.data[i]),
          Math.abs(box.bg[1] - image.data[i + 1]),
          Math.abs(box.bg[2] - image.data[i + 2])
        ) > 40
      )
        ink++;
    }
    if (ink < 2) {
      active = null;
      continue;
    }
    if (!active) {
      active = { y, bottom: y + 1 };
      bands.push(active);
    } else active.bottom = y + 1;
  }
  const lines = bands.filter((b) => b.bottom - b.y >= 4);
  if (
    lines.length < 2 ||
    lines.length > 4 ||
    lines.some((b, i) => i && b.y - lines[i - 1].bottom < 3)
  )
    return [box];
  const parts = inkParts(image, box);
  const groups = lines.map((line) =>
    parts.filter(
      (p) =>
        (p.y < line.bottom && p.y + p.h > line.y) ||
        (p.h <= 3 && p.y + p.h <= line.y && line.y - p.y - p.h <= 3)
    )
  );
  if (groups.some((g) => !g.length || !confirmedText(measure(image, partBox(box, g)))))
    return [box];
  return groups.map((g, i) => partBox(box, g, `line:${box.x}:${box.y}:${i}`));
}

export function joinStructuralGridParts(image, boxes) {
  const consumed = new Set(),
    grids = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      if (
        consumed.has(a) ||
        consumed.has(b) ||
        a.kind === 'control-icon' ||
        b.kind === 'control-icon'
      )
        continue;
      if (
        a.w > 44 ||
        b.w > 44 ||
        a.h > 36 ||
        b.h > 36 ||
        Math.abs(a.x - b.x) > 2 ||
        Math.abs(a.w - b.w) > 2
      )
        continue;
      const full = bounds([a, b]);
      if (full.h > 52 || full.w > 52) continue;
      const parts = inkParts(image, { ...a, ...full, atoms: null });
      if (!rectangularGrid(image, parts)) continue;
      consumed.add(a);
      consumed.add(b);
      grids.push(partBox(a, parts, `grid:${full.x}:${full.y}`, 'icon'));
    }
  return [...boxes.filter((b) => !consumed.has(b)), ...grids];
}

export function separateStructureLabels(image, boxes, measure) {
  const split = [];
  for (const box of boxes) {
    if (
      box.roleEvidence ||
      box.kind === 'control-icon' ||
      box.shape === 'image' ||
      box.w < 24 ||
      box.h < 8 ||
      box.h > 80
    ) {
      split.push(box);
      continue;
    }
    const atoms = inkParts(image, box);
    if (atoms.length < 3) {
      split.push(box);
      continue;
    }
    const separated = splitVerticalSeparators(image, box, atoms, boxes, measure);
    if (separated) {
      split.push(...separated);
      continue;
    }
    const styles = styleBoundary(image, box, atoms, measure);
    const groups =
      styles.length > 1 ? styles : splitSpacedLabels(image, box, atoms, boxes, measure);
    if (groups.length === 1) {
      split.push({ ...box, atoms });
      continue;
    }
    groups.forEach((parts, i) =>
      split.push(partBox(box, parts, `label:${box.x}:${box.y}:${i}`, 'text', styles.length === 1))
    );
  }
  return split;
}

export function collectAttachedStructureSymbols(
  image,
  boxes,
  measure,
  fitsTextFlow,
  possible,
  result
) {
  for (const box of boxes) {
    if (
      box.roleEvidence ||
      box.kind === 'control-icon' ||
      box.shape === 'image' ||
      box.w < 24 ||
      box.h < 8 ||
      box.h > 80
    ) {
      result.push(box);
      continue;
    }
    const prefixRun = attachedStructurePrefix(image, box);
    if (!prefixRun) {
      result.push(box);
      continue;
    }
    const { runs, cut, compound } = prefixRun;
    const prefix = runs.slice(0, cut).flatMap((r) => r.parts),
      rest = runs.slice(cut).flatMap((r) => r.parts),
      edge = bounds(prefix),
      tail = partBox(box, rest, box.structureGroup);
    const m = measure(image, tail);
    if (
      !m ||
      edge.w > 60 ||
      edge.h > 60 ||
      edge.w < 5 ||
      edge.h < 4 ||
      edge.w / edge.h < 0.45 ||
      edge.w / edge.h > 2.5 ||
      tail.w < 20
    ) {
      result.push(box);
      continue;
    }
    const symbol = partBox(box, prefix, box.structureGroup, 'icon');
    const fontLike = prefixHasGlyphAlignment(prefix, edge);
    const textEvidence =
      !compound &&
      (hasTextEvidence(image, { ...edge, bg: box.bg }, measure, boxes) ||
        fitsTextFlow(image, { ...edge, bg: box.bg }, box, boxes, measure));
    const large =
      !compound &&
      !fontLike &&
      !textEvidence &&
      edge.h >= m.xHeight * 1.45 &&
      edge.w >= m.xHeight * 0.8;
    possible.push({ box, symbol, tail, large, m, textEvidence });
    result.push(box);
  }
}

export function collectStandaloneStructureSymbols(image, boxes, measure, possible, result) {
  for (const box of boxes) {
    if (
      box.roleEvidence ||
      box.kind === 'control-icon' ||
      box.w > 52 ||
      box.h > 56 ||
      box.shape === 'image'
    )
      continue;
    const parts = inkParts(image, box);
    if (!parts.length) continue;
    const edge = bounds(parts);
    const gap = (q) => Math.max(q.x - box.x - box.w, box.x - q.x - q.w);
    const label = boxes
      .filter(
        (q) =>
          q !== box &&
          q.w >= Math.max(24, edge.w * 1.8) &&
          q.shape === 'text' &&
          gap(q) >= 0 &&
          gap(q) <= Math.max(20, edge.h * 1.5) &&
          Math.abs(centerY(q) - centerY(box)) <= Math.max(q.h, box.h) * 0.5
      )
      .sort((a, b) => gap(a) - gap(b))[0];
    if (!label) continue;
    const m = measure(image, label);
    if (
      m &&
      !hasTextEvidence(image, { ...edge, bg: box.bg }, measure, boxes) &&
      edge.h >= m.xHeight * 1.45 &&
      edge.w >= m.xHeight * 0.8 &&
      edge.w / edge.h >= 0.45 &&
      edge.w / edge.h <= 2.5
    ) {
      const symbol = partBox(box, parts, box.structureGroup, 'icon');
      const index = result.indexOf(box);
      if (index >= 0) result[index] = symbol;
      possible.push({ box, symbol, tail: label, large: true, m, standalone: true });
    }
  }
}

function prefixHasGlyphAlignment(prefix, edge) {
  const core = prefix.filter((p) => p.h >= edge.h * 0.5 && p.w <= p.h * 2.5),
    fontLike =
      core.length >= 2 &&
      Math.min(...core.map((p) => p.h)) >= Math.max(...core.map((p) => p.h)) * 0.75 &&
      Math.max(...core.map((p) => p.y + p.h)) - Math.min(...core.map((p) => p.y + p.h)) <=
        Math.max(1, edge.h * 0.2);
  return fontLike;
}

function attachedStructurePrefix(image, box) {
  const parts = inkParts(image, box),
    runs = sortedRuns(parts);
  let cut = -1,
    compound = false;
  for (let i = 1; i < runs.length; i++)
    if (runs[i].x - runs[i - 1].right >= 4) {
      cut = i;
      break;
    }
  if (cut < 0) {
    return null;
  }
  if (
    runs.length >= 3 &&
    runs[2].x - runs[1].right >= 4 &&
    opposedStrokes(image, runs[0].parts, runs[1].parts, box.bg)
  ) {
    cut = 2;
    compound = true;
  }
  return { runs, cut, compound };
}
