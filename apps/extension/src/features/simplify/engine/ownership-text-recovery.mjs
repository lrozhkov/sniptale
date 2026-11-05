import { extendedDescenderRow } from './ownership-ink.mjs';
import { inkParts } from './structure.mjs';
const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Repeated numeric-status labels can precede independent direction symbols.
export function recoverRepeatedNumericText(image, input, measure) {
  const candidates = [];
  for (const box of input) {
    const candidate = numericTextCandidate(image, box, input, measure);
    if (candidate) candidates.push(candidate);
  }
  return input.map((box) => {
    const current = candidates.find((c) => c.box === box);
    if (!current) return box;
    const peers = candidates.filter(
      (c) =>
        Math.max(...c.color.map((v, i) => Math.abs(v - current.color[i]))) <= 24 &&
        Math.min(c.m.xHeight, current.m.xHeight) >=
          Math.max(c.m.xHeight, current.m.xHeight) * 0.8 &&
        Math.min(c.m.stroke, current.m.stroke) >= Math.max(c.m.stroke, current.m.stroke) * 0.7
    );
    if (peers.length < 3) return box;
    const m = current.m,
      result = {
        ...box,
        shape: 'text',
        kind: 'status-text',
        roleEvidence: 'text-status',
        typeMetrics: m,
        textConfidence: true,
        textSize: Math.max(4, 2 * Math.round(m.xHeight * 0.8)),
        textCenterY: m.glyphBounds.y + m.glyphBounds.h / 2,
        contrast: m.foregroundContrast,
      };
    delete result.sourceBounds;
    delete result.sourceRuns;
    delete result.iconSize;
    return result;
  });
}

// Give a coherent source row one optical size and one replacement bar.
export function mergeRecoveredTextRows(image, input, measure, protectedRects) {
  const text = input.filter(
      (b) => b.shape === 'text' && b.textConfidence && b.typeMetrics?.glyphBounds
    ),
    used = new Set(),
    merged = [];
  const colors = new Map();
  const fg = (b) => {
    if (!colors.has(b)) colors.set(b, recoveredRowColor(image, b));
    return colors.get(b);
  };
  for (const seed of text) {
    if (seed.kind !== 'source-font-row' || used.has(seed)) continue;
    const group = [seed];
    used.add(seed);
    for (let i = 0; i < group.length; i++)
      for (const q of text) {
        if (used.has(q) || !recoveredRowsConnected(group[i], q, fg, input, protectedRects))
          continue;
        used.add(q);
        group.push(q);
      }
    if (group.length < 2) {
      used.delete(seed);
      continue;
    }
    const row = measuredRecoveredRow(image, seed, group, measure);
    if (!row) {
      for (const b of group) used.delete(b);
      continue;
    }
    merged.push(row);
  }
  return [...input.filter((b) => !used.has(b)), ...merged];
}

// Independent text anchors can establish the font of intervening source fragments.
export function recoverBridgedFontRows(image, input, measure, protectedRects) {
  const text = input.filter(
      (b) => b.shape === 'text' && b.textConfidence && b.typeMetrics?.glyphs >= 3
    ),
    removed = new Set(),
    rows = [];
  for (const a of text)
    for (const b of text) {
      if (a === b || removed.has(a) || removed.has(b) || a.x >= b.x) continue;
      const area = bridgeAnchorArea(a, b);
      if (!area) continue;
      const middle = input.filter((q) => q !== a && q !== b && intersects(q, area));
      if (
        middle.length < 2 ||
        middle.some(
          (q) =>
            !(
              (q.shape === 'image' && q.kind === 'small-image-group') ||
              (q.shape === 'unknown' && !q.roleEvidence) ||
              (q.shape === 'icon' && q.kind === 'control-icon' && !q.roleEvidence)
            )
        )
      )
        continue;
      const protectedInside = protectedRects.filter((q) => intersects(q, area));
      if (
        protectedInside.some(
          (q) =>
            q.kind !== 'outline' ||
            !middle.some((p) => p.kind === 'control-icon' && intersects(p, q))
        )
      )
        continue;
      const m = bridgedFontMetrics(image, a, b, area, middle, protectedInside, measure);
      if (!m) continue;
      const row = {
        ...a,
        ...area,
        kind: 'source-font-row',
        roleEvidence: 'text-flow',
        typeMetrics: m,
        textConfidence: true,
        textSize: Math.max(4, 2 * Math.round(m.xHeight * 0.8)),
        textCenterY: m.glyphBounds.y + m.glyphBounds.h / 2,
        contrast: m.foregroundContrast,
      };
      clearRecoveredRowSource(row);
      for (const p of protectedInside) {
        const index = protectedRects.indexOf(p);
        if (index >= 0) protectedRects.splice(index, 1);
      }
      removed.add(a);
      removed.add(b);
      for (const q of middle) removed.add(q);
      rows.push(row);
    }
  return [...input.filter((b) => !removed.has(b)), ...rows];
}

// A descender immediately adjoining a source row must match its body and stroke.
export function recoverTrailingDescenders(image, input, measure, protectedRects) {
  const removed = new Set(),
    rows = [];
  for (const label of input) {
    const font = descenderFontProfile(image, label);
    if (!font) continue;
    const { m, baseline, top, last, color } = font;
    for (const candidate of input) {
      if (
        !(
          (candidate.shape === 'icon' && !candidate.roleEvidence) ||
          (candidate.shape === 'image' && candidate.kind === 'local-texture')
        ) ||
        removed.has(candidate) ||
        protectedRects.some((p) => intersects(p, candidate))
      )
        continue;
      if (Math.max(...label.bg.map((v, i) => Math.abs(v - candidate.bg[i]))) > 8) continue;
      const p = descenderSourceGlyph(
        image,
        candidate,
        label,
        m,
        last,
        top,
        baseline,
        color,
        measure
      );
      if (!p) continue;
      const row = extendedDescenderRow(image, label, p, m, measure);
      if (!row) continue;
      // A small baseline mark immediately after the recovered glyph belongs to
      // the row when it matches the source ink and has no competing owner.
      attachDescenderMark(
        image,
        input,
        protectedRects,
        label,
        candidate,
        p,
        baseline,
        m,
        color,
        row
      );
      removed.add(label);
      removed.add(candidate);
      rows.push(row);
      break;
    }
  }
  return [...input.filter((b) => !removed.has(b)), ...rows];
}

// Weak media proposals may be individual source glyphs within a text word.
export function recoverWeakMediaText(image, input, measure, protectedRects) {
  const weak = input.filter(
    (b) =>
      ((b.shape === 'image' && b.kind === 'small-image-group') ||
        (b.shape === 'unknown' && !b.roleEvidence)) &&
      b.w <= 60 &&
      b.h <= 48 &&
      !protectedRects.some((p) => intersects(p, b))
  );
  const cache = new Map(),
    parts = new Map();
  const metric = (b) => {
    if (!cache.has(b)) cache.set(b, measure(image, { ...(b.sourceBounds || b), bg: b.bg }, 1));
    return cache.get(b);
  };
  const ink = (b) => {
    if (!parts.has(b))
      parts.set(
        b,
        inkParts(image, { ...b, atoms: null })
          .filter((p) => p.n >= 5)
          .sort((a, c) => a.x - c.x)
      );
    return parts.get(b);
  };
  const accepted = new Set(
    input.filter((b) => b.shape === 'text' && b.textConfidence && b.typeMetrics?.glyphs >= 2)
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of weak) {
      if (accepted.has(b)) continue;
      const m = metric(b);
      if (!m || m.glyphs < 1 || m.foregroundCoverage < 0.8) continue;
      if ([...accepted].some((q) => weakGlyphsAdjacent(q, b, metric, ink))) {
        accepted.add(b);
        changed = true;
      }
    }
  }
  // A multi-part prefix and adjacent glyph-sized fragments can establish a row
  // from source ink, including when a cropped image has later gained padding.
  for (const a of weak) {
    const row = weakPrefixRow(image, a, weak, ink, metric, measure);
    if (!row) continue;
    accepted.add(row.prefix);
    for (const b of row.sequence) accepted.add(b);
  }
  return input.map((b) => {
    if (!weak.includes(b) || !accepted.has(b)) return b;
    const m = metric(b),
      r = {
        ...b,
        shape: 'text',
        kind: 'source-font-row',
        roleEvidence: 'text-flow',
        typeMetrics: m,
        textConfidence: true,
        textSize: Math.max(4, 2 * Math.round(m.xHeight * 0.8)),
        textCenterY: m.glyphBounds.y + m.glyphBounds.h / 2,
        contrast: m.foregroundContrast,
      };
    delete r.sourceBounds;
    delete r.sourceRuns;
    delete r.iconSize;
    return r;
  });
}

// An inline component clipped by the raster edge can still belong to a continuous text row.
export function recoverClippedInlineGlyphs(image, input, measure) {
  return input.map((box) => {
    const s = box.sourceBounds || box;
    if (box.shape !== 'icon' || box.roleEvidence !== 'inline-symbol' || s.y + s.h !== image.height)
      return box;
    const peers = input.filter(
      (q) =>
        q.shape === 'text' &&
        q.textConfidence &&
        q.typeMetrics?.glyphs >= 3 &&
        q.y + q.h >= image.height &&
        Math.max(...q.bg.map((v, i) => Math.abs(v - box.bg[i]))) <= 5 &&
        Math.abs(q.y - box.y) <= 3
    );
    const left = peers.find((q) => q.x + q.w <= box.x && box.x - q.x - q.w <= s.h),
      right = peers.find((q) => q.x >= box.x + box.w - 2 && q.x - box.x - box.w <= s.h);
    if (!left || !right) return box;
    const m = measure(image, { ...s, bg: box.bg }, 1),
      p = right.typeMetrics;
    if (
      !m ||
      m.glyphs !== 1 ||
      m.xHeight < p.xHeight * 0.6 ||
      m.xHeight > p.xHeight * 1.5 ||
      m.stroke / p.stroke < 0.6 ||
      m.stroke / p.stroke > 1.6
    )
      return box;
    const result = {
      ...box,
      shape: 'text',
      kind: 'clipped-row-text',
      roleEvidence: 'text-boundary',
      typeMetrics: m,
      textConfidence: true,
      textSize: right.textSize,
      textCenterY: right.textCenterY ?? right.y + right.h / 2,
    };
    delete result.sourceBounds;
    delete result.sourceRuns;
    delete result.iconSize;
    return result;
  });
}

function numericTextCandidate(image, box, input, measure) {
  if (box.shape !== 'icon' || box.roleEvidence !== 'repeated-symbol') return null;
  const arrow = input.find(
    (q) =>
      q.roleEvidence === 'direction-symbol' &&
      q.x >= box.x + box.w - 1 &&
      q.x - box.x - box.w <= 3 &&
      Math.abs(q.y + q.h / 2 - box.y - box.h / 2) <= 2
  );
  const source = { ...(box.sourceBounds || box), bg: box.bg },
    m = measure(image, source, 1);
  const label = input.find((q) => {
    if (
      q.shape !== 'text' ||
      !q.textConfidence ||
      q.typeMetrics?.glyphs < 3 ||
      !m?.glyphBounds ||
      q.x + q.w > box.x + 1 ||
      box.x - q.x - q.w > box.h ||
      q.typeMetrics.xHeight < box.h
    )
      return false;
    const bottoms = inkParts(image, { ...q, atoms: null })
      .filter((p) => p.h >= q.typeMetrics.xHeight * 0.75 && p.h <= q.typeMetrics.xHeight * 1.3)
      .map((p) => p.y + p.h)
      .sort((a, b) => a - b);
    return (
      bottoms.length >= 3 &&
      Math.abs(bottoms[Math.floor(bottoms.length / 2)] - m.glyphBounds.y - m.glyphBounds.h) <= 2
    );
  });
  if (!arrow || !label) return null;
  if (
    !m ||
    m.glyphs < 2 ||
    m.baselineAgreement < 0.9 ||
    m.heightAgreement < 0.9 ||
    m.foregroundCoverage < 0.9 ||
    m.stroke / m.xHeight > 0.35
  )
    return null;
  const parts = inkParts(image, source).filter((p) => p.n >= 5);
  if (!parts.length) return null;
  const n = parts.reduce((sum, p) => sum + p.n, 0),
    color = [0, 1, 2].map((c) => parts.reduce((sum, p) => sum + p.rgb[c] * p.n, 0) / n);
  return { box, m, color };
}

function recoveredRowColor(image, b) {
  const samples = [[], [], []],
    threshold = Math.max(40, (b.typeMetrics.foregroundContrast || 0) * 0.7);
  for (let y = Math.max(0, b.y); y < Math.min(image.height, b.y + b.h); y++)
    for (let x = Math.max(0, b.x); x < Math.min(image.width, b.x + b.w); x++) {
      const i = (y * image.width + x) * 4;
      if (Math.max(...b.bg.map((v, c) => Math.abs(v - image.data[i + c]))) < threshold) continue;
      for (let c = 0; c < 3; c++) samples[c].push(image.data[i + c]);
    }
  return samples.map((a) => {
    a.sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)] ?? 0;
  });
}

function recoveredRowsConnected(a, b, fg, input, protectedRects) {
  const am = a.typeMetrics,
    bm = b.typeMetrics,
    gap = Math.max(a.x - b.x - b.w, b.x - a.x - a.w, 0),
    xh = Math.min(am.xHeight, bm.xHeight);
  if (
    gap > Math.max(3, Math.ceil(xh * 0.65)) ||
    Math.abs(a.y + a.h / 2 - b.y - b.h / 2) > Math.max(a.h, b.h) * 0.45
  )
    return false;
  if (
    Math.min(am.xHeight, bm.xHeight) < Math.max(am.xHeight, bm.xHeight) * 0.7 ||
    Math.min(am.stroke, bm.stroke) < Math.max(am.stroke, bm.stroke) * 0.6
  )
    return false;
  if (
    Math.max(...a.bg.map((v, i) => Math.abs(v - b.bg[i]))) > 8 ||
    Math.max(...fg(a).map((v, i) => Math.abs(v - fg(b)[i]))) > 32
  )
    return false;
  const left = a.x < b.x ? a : b,
    right = left === a ? b : a,
    space = {
      x: left.x + left.w,
      y: Math.max(left.y, right.y),
      w: Math.max(0, right.x - left.x - left.w),
      h: Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y)),
    };
  if (
    space.w &&
    space.h &&
    [...protectedRects, ...input.filter((q) => q !== a && q !== b && q.shape !== 'text')].some(
      (q) => intersects(q, space)
    )
  )
    return false;
  return true;
}

function attachDescenderMark(
  image,
  input,
  protectedRects,
  label,
  candidate,
  p,
  baseline,
  m,
  color,
  row
) {
  const start = p.x + p.w,
    scanY = Math.max(0, Math.floor(baseline - m.stroke * 2)),
    scan = {
      x: start,
      y: scanY,
      w: Math.min(image.width - start, Math.ceil(m.xHeight)),
      h: Math.min(image.height - scanY, Math.ceil(m.stroke * 5)),
      bg: label.bg,
    };
  const marks = inkParts(image, scan).filter(
    (q) =>
      q.n >= 5 &&
      q.x - start <= Math.ceil(m.stroke) &&
      q.w <= m.stroke * 2.5 &&
      q.h <= m.stroke * 3 &&
      q.y >= baseline - m.stroke * 2 &&
      q.y < baseline &&
      q.y + q.h > baseline &&
      q.y + q.h <= baseline + m.stroke * 2 &&
      Math.max(...q.rgb.map((v, c) => Math.abs(v - color[c]))) <= 40
  );
  if (
    marks.length === 1 &&
    !protectedRects.some((q) => intersects(q, marks[0])) &&
    !input.some(
      (q) => q !== label && q !== candidate && q.shape !== 'text' && intersects(q, marks[0])
    )
  ) {
    const mark = marks[0];
    row.w = Math.max(row.w, mark.x + mark.w + 1 - row.x);
    row.h = Math.max(row.h, mark.y + mark.h + 1 - row.y);
    row.terminalMark = { x: mark.x, y: mark.y, w: mark.w, h: mark.h };
  }
}

function weakGlyphsAdjacent(a, b, metric, ink) {
  if (
    Math.max(a.x - b.x - b.w, b.x - a.x - a.w, 0) > Math.max(a.h, b.h) * 0.25 ||
    Math.abs(a.y + a.h / 2 - b.y - b.h / 2) > Math.max(a.h, b.h) * 0.6
  )
    return false;
  if (Math.max(...a.bg.map((v, i) => Math.abs(v - b.bg[i]))) > 8) return false;
  const am = metric(a),
    bm = metric(b),
    ap = ink(a),
    bp = ink(b);
  if (
    !am ||
    !bm ||
    !ap.length ||
    !bp.length ||
    am.foregroundCoverage < 0.8 ||
    bm.foregroundCoverage < 0.8
  )
    return false;
  if (
    Math.min(am.stroke, bm.stroke) < Math.max(am.stroke, bm.stroke) * 0.6 ||
    Math.min(am.xHeight, bm.xHeight) < Math.max(am.xHeight, bm.xHeight) * 0.7
  )
    return false;
  const left = a.x < b.x ? ap : bp,
    right = a.x < b.x ? bp : ap,
    edge = left.at(-1),
    next = right[0],
    gap = next.x - edge.x - edge.w;
  if (gap < 0 || gap > Math.max(2, Math.floor(Math.min(am.stroke, bm.stroke) * 0.8))) return false;
  return (
    Math.abs(edge.y + edge.h - (next.y + next.h)) <=
    Math.max(2, Math.ceil(Math.min(am.xHeight, bm.xHeight) * 0.12))
  );
}

function weakPrefixRow(image, a, weak, ink, metric, measure) {
  if (a.shape !== 'unknown' || ink(a).length < 2) return null;
  const group = weak
    .filter(
      (b) =>
        b.shape === 'image' &&
        b.x >= a.x + a.w - 2 &&
        Math.abs(a.y + a.h / 2 - b.y - b.h / 2) <= Math.max(a.h, b.h) * 0.4
    )
    .sort((x, y) => x.x - y.x);
  const sequence = [];
  let prev = a;
  for (const b of group) {
    if (!weakGlyphsAdjacent(prev, b, metric, ink)) break;
    sequence.push(b);
    prev = b;
  }
  if (sequence.length < 3) return null;
  const members = [a, ...sequence],
    x = Math.min(...members.map((b) => b.x)),
    y = Math.min(...members.map((b) => b.y)),
    right = Math.max(...members.map((b) => b.x + b.w)),
    bottom = Math.max(...members.map((b) => b.y + b.h));
  const row = measure(image, { x, y, w: right - x, h: bottom - y, bg: a.bg }, 1);
  if (
    !row ||
    row.glyphs < 4 ||
    row.foregroundCoverage < 0.8 ||
    row.baselineAgreement < 0.9 ||
    row.heightAgreement < 0.9 ||
    row.stroke / row.xHeight > 0.3
  )
    return null;
  const colors = members
    .flatMap(ink)
    .filter((p) => p.h >= row.xHeight * 0.6)
    .map((p) => p.rgb);
  if (colors.length < 4) return null;
  const fg = [0, 1, 2].map(
    (c) => colors.map((q) => q[c]).sort((u, v) => u - v)[Math.floor(colors.length / 2)]
  );
  if (colors.some((q) => Math.max(...q.map((v, c) => Math.abs(v - fg[c]))) > 24)) return null;
  return { prefix: a, sequence };
}

function measuredRecoveredRow(image, seed, group, measure) {
  const x = Math.min(...group.map((b) => b.x)),
    y = Math.min(...group.map((b) => b.y)),
    right = Math.max(...group.map((b) => b.x + b.w)),
    bottom = Math.max(...group.map((b) => b.y + b.h));
  const row = {
      ...seed,
      x,
      y,
      w: right - x,
      h: bottom - y,
      kind: 'source-font-row',
      componentCount: group.length,
    },
    m = measure(image, row, 1);
  if (
    !m ||
    m.glyphs < 3 ||
    m.foregroundCoverage < 0.8 ||
    m.baselineAgreement < 0.7 ||
    m.heightAgreement < 0.7
  ) {
    return null;
  }
  for (const key of [
    'sourceBounds',
    'sourceRuns',
    'eraseRuns',
    'erasePlane',
    'eraseLayers',
    'eraseFragments',
    'atoms',
    'iconSize',
    'rowTextSize',
    'textDecorations',
  ])
    delete row[key];
  row.typeMetrics = m;
  row.textConfidence = true;
  row.textSize = Math.max(4, 2 * Math.round(m.xHeight * 0.8));
  row.textCenterY = m.glyphBounds.y + m.glyphBounds.h / 2;
  row.contrast = m.foregroundContrast;
  if (group.some((b) => b.eraseFragments))
    row.eraseFragments = group.flatMap(
      (b) =>
        b.eraseFragments || [
          { x: b.x, y: b.y, w: b.w, h: b.h, bg: b.bg, surfaceClip: b.surfaceClip },
        ]
    );
  return row;
}

function bridgedFontMetrics(image, a, b, area, middle, protectedInside, measure) {
  const am = a.typeMetrics,
    bm = b.typeMetrics,
    xh = Math.min(am.xHeight, bm.xHeight);
  const bounds = { ...area, shape: 'text' },
    m = measure(image, bounds, 1);
  if (
    !m ||
    m.glyphs < am.glyphs + bm.glyphs + 2 ||
    m.baselineAgreement < 0.9 ||
    m.heightAgreement < 0.9 ||
    m.foregroundCoverage < 0.96 ||
    m.stroke / m.xHeight > 0.35
  )
    return null;
  if (
    am.typeStroke &&
    bm.typeStroke &&
    Math.min(am.typeStroke, bm.typeStroke) < Math.max(am.typeStroke, bm.typeStroke) * 0.8
  )
    return null;
  const parts = inkParts(image, bounds)
    .filter((p) => p.n >= 5)
    .sort((p, q) => p.x - q.x);
  if (!bridgePartsContinuous(parts, xh)) return null;
  if (!bridgeProtectionMatches(parts, middle, protectedInside, m, xh)) return null;
  const colors = parts.filter((p) => p.h >= xh * 0.6).map((p) => p.rgb);
  if (colors.length < 6) return null;
  const color = [0, 1, 2].map(
    (c) => colors.map((q) => q[c]).sort((u, v) => u - v)[Math.floor(colors.length / 2)]
  );
  if (
    colors.filter((q) => Math.max(...q.map((v, c) => Math.abs(v - color[c]))) <= 24).length <
    colors.length * 0.9
  )
    return null;
  return m;
}

function bridgePartsContinuous(parts, xh) {
  let edge = parts[0]?.x ?? 0,
    continuous = true;
  for (const p of parts) {
    if (p.x - edge > xh * 0.8) {
      continuous = false;
      break;
    }
    edge = Math.max(edge, p.x + p.w);
  }
  return continuous;
}

function bridgeProtectionMatches(parts, middle, protectedInside, m, xh) {
  return protectedInside.every((mark) => {
    const candidate = middle.find((q) => q.kind === 'control-icon' && intersects(q, mark)),
      source = candidate.sourceBounds || candidate;
    const inside = parts.filter((p) => intersects(p, source)),
      left = parts.filter((p) => p.x + p.w <= source.x + 1).at(-1),
      right = parts.find((p) => p.x >= source.x + source.w - 1);
    if (!inside.length || !left || !right) return false;
    const first = inside[0],
      last = inside.at(-1),
      limit = Math.max(2, Math.ceil(m.stroke * 1.25));
    return (
      first.x - left.x - left.w <= limit &&
      right.x - last.x - last.w <= limit &&
      first.h >= xh * 0.75 &&
      first.h <= xh * 1.3
    );
  });
}

function clearRecoveredRowSource(row) {
  for (const key of [
    'sourceBounds',
    'sourceRuns',
    'eraseRuns',
    'erasePlane',
    'eraseLayers',
    'eraseFragments',
    'atoms',
    'iconSize',
    'rowTextSize',
    'textDecorations',
  ])
    delete row[key];
}

function descenderSourceGlyph(image, candidate, label, m, last, top, baseline, color, measure) {
  const source = { ...(candidate.sourceBounds || candidate), bg: candidate.bg },
    ink = inkParts(image, source).filter((p) => p.n >= 5);
  if (ink.length !== 1) return null;
  const p = ink[0],
    gap = p.x - last.x - last.w;
  if (
    gap < 0 ||
    gap > Math.max(2, Math.ceil(m.stroke * 0.8)) ||
    Math.abs(p.y - top) > 2 ||
    p.w > m.xHeight * 1.5
  )
    return null;
  const descender =
    candidate.shape === 'icon' &&
    p.y + p.h >= baseline + m.xHeight * 0.2 &&
    p.y + p.h <= baseline + m.xHeight * 0.6;
  const ordinary = candidate.shape === 'image' && Math.abs(p.y + p.h - baseline) <= 2;
  if (!descender && !ordinary) return null;
  if (Math.max(...p.rgb.map((v, c) => Math.abs(v - color[c]))) > 24) return null;
  const cm = measure(image, source, 1);
  if (
    !cm ||
    cm.glyphs !== 1 ||
    cm.foregroundCoverage < 0.95 ||
    Math.min(cm.stroke, m.stroke) < Math.max(cm.stroke, m.stroke) * 0.8
  )
    return null;
  return p;
}

function bridgeAnchorArea(a, b) {
  const am = a.typeMetrics,
    bm = b.typeMetrics,
    xh = Math.min(am.xHeight, bm.xHeight),
    gap = b.x - a.x - a.w;
  if (
    gap < 0 ||
    gap > xh * 12 ||
    Math.min(am.xHeight, bm.xHeight) < Math.max(am.xHeight, bm.xHeight) * 0.85 ||
    Math.min(am.stroke, bm.stroke) < Math.max(am.stroke, bm.stroke) * 0.8
  )
    return null;
  if (
    Math.max(...a.bg.map((v, i) => Math.abs(v - b.bg[i]))) > 8 ||
    Math.abs(a.y + a.h / 2 - b.y - b.h / 2) > Math.max(a.h, b.h) * 0.25
  )
    return null;
  const area = {
    x: a.x,
    y: Math.min(a.y, b.y),
    w: b.x + b.w - a.x,
    h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
    bg: a.bg,
  };
  return area;
}

function descenderFontProfile(image, label) {
  const m = label.typeMetrics;
  if (label.shape !== 'text' || !label.textConfidence || !m || m.glyphs < 8 || !m.glyphBounds)
    return null;
  const parts = inkParts(image, { ...label, atoms: null })
    .filter((p) => p.n >= 5 && p.h >= m.xHeight * 0.8 && p.h <= m.xHeight * 1.3)
    .sort((a, b) => a.x - b.x);
  if (parts.length < 4) return null;
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)],
    baseline = median(parts.map((p) => p.y + p.h)),
    top = baseline - m.xHeight,
    last = parts.at(-1);
  const color = [0, 1, 2].map((c) => median(parts.map((p) => p.rgb[c])));
  return { m, baseline, top, last, color };
}
