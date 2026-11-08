import { inkParts } from './structure.mjs';
import {
  bounds,
  contains,
  intersect,
  grid,
  arrowBracket,
  listDiagram,
  stackedArrows,
  bookContour,
  filledVerticalPointer,
} from './compact-contours.mjs';
import {
  uncertainColorTexture,
  createTextPixelEvidence,
  iconRowDots,
  staggeredColor,
  joinedStaggeredPrefix,
} from './compact-textures.mjs';
import { splitRepeatedChevron } from './compact-separators.mjs';

function splitGraphicPrefix(image, box, input, measure, protectedRects) {
  if (
    box.shape !== 'text' ||
    !box.textConfidence ||
    box.w < box.h * 3 ||
    box.eraseFragments ||
    box.textDecorations
  )
    return null;
  const parts = inkParts(image, { ...box, atoms: null }).sort((a, b) => a.x - b.x || a.y - b.y);
  if (parts.length < 4) return null;
  const selection = graphicPrefixParts(image, box, parts);
  if (!selection) return null;
  const { selected, reason } = selection;
  const tight = bounds(selected),
    rest = parts.slice(selected.length),
    unit = Math.min(...selected.map((p) => p.h));
  const next = rest.reduce((x, p) => Math.min(x, p.x), Infinity),
    gap = next - (tight.x + tight.w);
  if (
    gap < Math.max(2, unit * 0.15) ||
    gap > unit * 1.5 ||
    rest.some((p) => p.x < tight.x + tight.w)
  )
    return null;
  if (
    protectedRects.some((p) => intersect(tight, p)) ||
    input.some((p) => p !== box && intersect(tight, p))
  )
    return null;
  const remainder = { ...box, x: next - 1, w: box.x + box.w - next + 1 };
  const m = measure(image, remainder);
  if (!m || m.glyphs < 3 || m.baselineAgreement < 0.7 || m.heightAgreement < 0.7 || !m.glyphBounds)
    return null;
  // Reduced-size citations and subscripts remain part of their text row.
  if (unit < m.xHeight * 0.8 || Math.max(...selected.map((p) => p.h)) > m.xHeight * 1.8)
    return null;
  installCaptionMeasurement(remainder, m);
  const sourceBounds = {
    x: Math.max(box.x, tight.x - 1),
    y: Math.max(box.y, tight.y - 1),
    w: tight.w + 2,
    h: tight.h + 2,
  };
  const icon = {
    ...sourceBounds,
    bg: box.bg,
    contrast: box.contrast,
    shape: 'icon',
    kind: 'compact-graphic',
    compact: true,
    roleEvidence: reason,
    iconSize: Math.min(tight.w, tight.h),
    sourceBounds,
    atoms: selected,
  };
  return [icon, remainder];
}

// A separate horizontal foot and an outlined diagonal shaft can form a compact
// graphic after a coherent label. Both features must come from source pixels.
function splitDiagonalSuffix(image, box, input, measure, protectedRects) {
  if (
    box.shape !== 'text' ||
    !box.textConfidence ||
    box.w < box.h * 3 ||
    box.eraseFragments ||
    box.textDecorations
  )
    return null;
  const parts = inkParts(image, { ...box, atoms: null });
  for (const foot of parts)
    for (const shaft of parts) {
      if (!diagonalFootPair(foot, shaft)) continue;
      const tight = bounds([foot, shaft]);
      if (tight.w > box.h * 1.5 || tight.h > box.h * 1.5) continue;
      const rest = parts.filter((p) => p !== foot && p !== shaft),
        last = Math.max(...rest.map((p) => p.x + p.w));
      const gap = tight.x - last;
      if (
        gap < Math.max(3, shaft.w * 0.3) ||
        gap > shaft.w * 1.8 ||
        rest.some((p) => p.x + p.w > tight.x)
      )
        continue;
      if (!outlinedDiagonal(image, shaft, box.bg)) continue;
      if (
        protectedRects.some((p) => intersect(tight, p)) ||
        input.some((p) => p !== box && intersect(tight, p))
      )
        continue;
      const remainder = { ...box, w: last - box.x + 1 };
      const m = measure(image, remainder);
      if (
        !m ||
        m.glyphs < 3 ||
        m.baselineAgreement < 0.7 ||
        m.heightAgreement < 0.7 ||
        !m.glyphBounds ||
        shaft.h < m.xHeight * 0.8 ||
        shaft.h > m.xHeight * 1.8
      )
        continue;
      installCaptionMeasurement(remainder, m);
      const sourceBounds = {
        x: Math.max(box.x, tight.x - 1),
        y: Math.max(box.y, tight.y - 1),
        w: tight.w + 2,
        h: tight.h + 2,
      };
      return [
        {
          ...sourceBounds,
          bg: box.bg,
          contrast: box.contrast,
          shape: 'icon',
          kind: 'compact-graphic',
          compact: true,
          roleEvidence: 'outlined-diagonal-foot',
          iconSize: Math.min(tight.w, tight.h),
          sourceBounds,
          atoms: [shaft, foot],
        },
        remainder,
      ];
    }
  return null;
}

function separateVerticalPointer(image, box, input, measure, protectedRects) {
  if (box.shape !== 'unknown' || !box.bg || box.w > 40 || box.h > 25) return null;
  const parts = inkParts(image, { ...box, atoms: null });
  if (parts.length !== 1) return null;
  const p = parts[0];
  if (!filledVerticalPointer(image, p, box.bg)) return null;
  if (
    protectedRects.some((q) => intersect(p, q)) ||
    input.some((q) => q !== box && intersect(p, q))
  )
    return null;
  const label = input.find((q) => {
    if (q === box || q.shape !== 'text' || !q.textConfidence) return false;
    const m = measure(image, q);
    if (
      !m ||
      m.glyphs < 3 ||
      m.baselineAgreement < 0.7 ||
      m.heightAgreement < 0.7 ||
      !m.glyphBounds
    )
      return false;
    const gap = p.x - (m.glyphBounds.x + m.glyphBounds.w);
    return (
      gap >= Math.max(2, p.h * 0.65) &&
      gap <= p.h * 2.5 &&
      p.h >= m.xHeight * 0.25 &&
      p.h <= m.xHeight * 0.7 &&
      Math.abs(p.y + p.h / 2 - m.glyphBounds.y - m.glyphBounds.h / 2) <= m.xHeight * 0.45
    );
  });
  if (!label) return null;
  const sourceBounds = {
    x: Math.max(box.x, p.x - 1),
    y: Math.max(box.y, p.y - 1),
    w: p.w + 2,
    h: p.h + 2,
  };
  return {
    ...sourceBounds,
    bg: box.bg,
    contrast: box.contrast,
    shape: 'icon',
    kind: 'compact-graphic',
    compact: true,
    roleEvidence: 'vertical-pointer-suffix',
    iconSize: Math.min(p.w, p.h),
    sourceBounds,
    atoms: [p],
  };
}

// A compact filled vertical pointer after a coherent caption has its own owner.
function splitVerticalPointerSuffix(image, box, input, measure, protectedRects) {
  if (
    box.shape !== 'text' ||
    !box.textConfidence ||
    box.w < box.h * 3 ||
    box.eraseFragments ||
    box.textDecorations
  )
    return null;
  const parts = inkParts(image, { ...box, atoms: null }).sort((a, b) => a.x - b.x),
    p = parts.at(-1);
  if (!p || parts.length < 4 || !filledVerticalPointer(image, p, box.bg)) return null;
  const rest = parts.slice(0, -1),
    last = Math.max(...rest.map((q) => q.x + q.w)),
    gap = p.x - last;
  if (gap < Math.max(2, p.h * 0.65) || gap > p.h * 2.5 || rest.some((q) => q.x + q.w > p.x))
    return null;
  if (
    protectedRects.some((q) => intersect(p, q)) ||
    input.some((q) => q !== box && intersect(p, q))
  )
    return null;
  const remainder = { ...box, w: last - box.x + 1 },
    m = measure(image, remainder);
  if (
    !m ||
    m.glyphs < 3 ||
    m.baselineAgreement < 0.7 ||
    m.heightAgreement < 0.7 ||
    !m.glyphBounds ||
    p.h < m.xHeight * 0.25 ||
    p.h > m.xHeight * 0.7 ||
    Math.abs(p.y + p.h / 2 - (m.glyphBounds.y + m.glyphBounds.h / 2)) > m.xHeight * 0.45
  )
    return null;
  if (terminalPeriod(rest, p, m, gap)) return null;
  installCaptionMeasurement(remainder, m);
  const sourceBounds = {
    x: Math.max(box.x, p.x - 1),
    y: Math.max(box.y, p.y - 1),
    w: p.w + 2,
    h: p.h + 2,
  };
  return [
    {
      ...sourceBounds,
      bg: box.bg,
      contrast: box.contrast,
      shape: 'icon',
      kind: 'compact-graphic',
      compact: true,
      roleEvidence: 'vertical-pointer-suffix',
      iconSize: Math.min(p.w, p.h),
      sourceBounds,
      atoms: [p],
    },
    remainder,
  ];
}

/**
 * Claim compact grids, arrow compositions, and list diagrams from existing proposals. Returns new boxes;
 * image pixels and the input array are unchanged. The caller supplies the same
 * typography measure used by the detector. Only proposals fully accounted for
 * by the geometric claim are consumed; ambiguous candidates are preserved.
 */
export function claimCompactGraphics(image, input, measure, options = {}) {
  const protectedRects = (options.protected || input.protected || []).filter(
    (b) => b.kind !== 'outline'
  );
  const peerEvidence = createTextPixelEvidence(image, input);
  const used = new Set(),
    output = [];
  for (let i = 0; i < input.length; i++) {
    const first = input[i];
    if (
      used.has(i) ||
      !['text', 'unknown'].includes(first.shape) ||
      first.kind === 'control-icon' ||
      !first.bg
    )
      continue;
    if (uncertainColorTexture(image, first, peerEvidence)) {
      output.push({ ...first, shape: 'unknown', roleEvidence: 'uncertain-color-texture' });
      used.add(i);
      continue;
    }
    const chevrons = splitRepeatedChevron(image, first, input, measure, protectedRects);
    if (chevrons) {
      output.push(...chevrons.boxes);
      chevrons.owners.forEach((q) => used.add(input.indexOf(q)));
      continue;
    }
    const split = splitCompactProposal(image, first, input, measure, protectedRects);
    if (split) {
      output.push(...split);
      used.add(i);
      continue;
    }
    if (first.roleEvidence) continue;
    const staggered = claimStaggeredColor(image, first, input, used, i, protectedRects);
    if (staggered) {
      output.push(staggered);
      used.add(i);
      continue;
    }
    const candidates = contourCandidates(input, used, i);
    const claim = claimContourCandidate(image, input, used, i, candidates, measure, protectedRects);
    if (claim) {
      output.push(claim.box);
      claim.indices.forEach((k) => used.add(k));
    }
  }
  return [...input.filter((_, i) => !used.has(i)), ...output];
}

function installCaptionMeasurement(remainder, m) {
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
    delete remainder[key];
  remainder.typeMetrics = m;
  remainder.textConfidence = true;
  remainder.textCenterY = m.glyphBounds.y + m.glyphBounds.h / 2;
  remainder.textSize = Math.max(4, 2 * Math.round(m.xHeight * 0.8));
}

function graphicPrefixParts(image, box, parts) {
  const [a, b] = parts,
    small = Math.min(a.h, b.h),
    large = Math.max(a.h, b.h);
  let selected = null,
    reason = null;
  if (bookContour(image, a, box.bg) || bookContour(image, a, box.bg, true)) {
    selected = [a];
    reason = 'book-contours';
  } else if (
    small >= 7 &&
    small / large >= 0.7 &&
    Math.min(a.w, b.w) >= small * 0.55 &&
    Math.max(a.w, b.w) <= large * 1.4
  ) {
    const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
      pair = bounds([a, b]);
    if (
      overlap >= 1 &&
      overlap <= Math.min(a.w, b.w) * 0.55 &&
      Math.abs(a.y - b.y) >= small * 0.45 &&
      Math.abs(a.y + a.h - b.y - b.h) >= small * 0.35 &&
      pair.w / pair.h >= 0.7 &&
      pair.w / pair.h <= 1.4 &&
      pair.w <= box.h * 1.5
    ) {
      selected = [a, b];
      reason = 'staggered-pair';
    }
  }
  if (!selected) return null;
  return { selected, reason };
}

function outlinedDiagonal(image, shaft, bg) {
  const ink = (x, y) => {
    const i = (y * image.width + x) * 4;
    return Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40;
  };
  const matchesAxis = (direction) => {
    let diagonal = 0,
      off = 0,
      center = 0;
    for (let y = 0; y < shaft.h; y++)
      for (let x = 0; x < shaft.w; x++)
        if (ink(shaft.x + x, shaft.y + y)) {
          const xNorm = (x + 0.5) / shaft.w,
            yNorm = (y + 0.5) / shaft.h;
          const d = Math.abs(direction === 1 ? xNorm + yNorm - 1 : xNorm - yNorm);
          if (d < 0.4) diagonal++;
          else off++;
          if (d < 0.12 && x > shaft.w * 0.25 && x < shaft.w * 0.75) center++;
        }
    return diagonal >= shaft.n * 0.8 && off <= diagonal * 0.25 && center <= diagonal * 0.25;
  };
  return [1, -1].some(matchesAxis);
}

function diagonalFootPair(foot, shaft) {
  if (
    foot === shaft ||
    foot.h > Math.max(2, foot.w * 0.16) ||
    foot.w < 8 ||
    shaft.w < 7 ||
    shaft.h < 7 ||
    shaft.w / shaft.h < 0.7 ||
    shaft.w / shaft.h > 1.4
  )
    return false;
  if (
    foot.y < shaft.y + shaft.h ||
    foot.y - (shaft.y + shaft.h) > Math.max(2, shaft.h * 0.25) ||
    Math.abs(foot.x + foot.w / 2 - (shaft.x + shaft.w / 2)) > shaft.w * 0.25 ||
    foot.w < shaft.w * 0.8 ||
    foot.w > shaft.w * 1.5
  )
    return false;
  return true;
}

function terminalPeriod(rest, p, m, gap) {
  // A small baseline component with letter spacing and matching ink can be a
  // terminal period. Keep it with the independently measured caption.
  const glyphs = rest.filter((q) => q.h >= m.xHeight * 0.65),
    bottoms = glyphs.map((q) => q.y + q.h).sort((a, b) => a - b);
  const baseline = bottoms[Math.floor(bottoms.length / 2)],
    nearest = glyphs.reduce((a, b) => (!a || b.x + b.w > a.x + a.w ? b : a), null);
  if (
    nearest &&
    gap <= Math.max(2, m.stroke * 1.5) &&
    p.w <= m.stroke * 2.5 &&
    p.h <= m.stroke * 1.8 &&
    Math.abs(p.y + p.h - baseline) <= Math.max(1, m.xHeight * 0.12) &&
    Math.max(...p.rgb.map((v, i) => Math.abs(v - nearest.rgb[i]))) <= 45
  )
    return true;
  return false;
}

function splitCompactProposal(image, first, input, measure, protectedRects) {
  const dots = iconRowDots(image, first, input, protectedRects);
  if (dots) return [dots];
  const joined = joinedStaggeredPrefix(image, first, input, measure, protectedRects);
  if (joined) return [joined];
  const separatePointer = separateVerticalPointer(image, first, input, measure, protectedRects);
  if (separatePointer) return [separatePointer];
  const pointer = splitVerticalPointerSuffix(image, first, input, measure, protectedRects);
  if (pointer) return pointer;
  const suffix = splitDiagonalSuffix(image, first, input, measure, protectedRects);
  if (suffix) return suffix;
  return splitGraphicPrefix(image, first, input, measure, protectedRects);
}

function claimStaggeredColor(image, first, input, used, i, protectedRects) {
  const staggered = staggeredColor(image, first);
  if (
    staggered &&
    !protectedRects.some((p) => intersect(staggered.tight, p)) &&
    !input.some((other, k) => k !== i && !used.has(k) && intersect(staggered.tight, other))
  ) {
    const { tight, parts, runs } = staggered;
    return {
      ...first,
      ...tight,
      sourceBounds: { ...tight },
      sourceRuns: runs,
      atoms: parts,
      componentCount: 2,
      shape: 'icon',
      compact: true,
      kind: 'compact-graphic',
      roleEvidence: 'staggered-color',
      iconSize: Math.min(tight.w, tight.h),
    };
  }
  return null;
}

function contourCandidates(input, used, i) {
  const first = input[i];
  const candidates = [
    { indices: [i], extended: false },
    { indices: [i], extended: true },
  ];
  for (let j = i + 1; j < input.length; j++) {
    const q = input[j];
    if (
      used.has(j) ||
      !['text', 'unknown'].includes(q.shape) ||
      q.roleEvidence ||
      q.kind === 'control-icon' ||
      !q.bg
    )
      continue;
    const whole = bounds([first, q]);
    if (
      whole.w <= 40 &&
      whole.h <= 40 &&
      Math.max(...q.bg.map((v, c) => Math.abs(v - first.bg[c]))) <= 8
    )
      candidates.push({ indices: [i, j], extended: false });
  }
  return candidates;
}

function claimContourCandidate(image, input, used, i, candidates, measure, protectedRects) {
  const first = input[i];
  for (const { indices, extended } of candidates) {
    const claims = indices.map((k) => input[k]),
      base = bounds(claims);
    const area = extended
      ? {
          x: Math.max(0, base.x - 2),
          y: Math.max(0, base.y - base.h),
          w: Math.min(image.width - Math.max(0, base.x - 2), base.w + 4),
          h: Math.min(image.height - Math.max(0, base.y - base.h), base.h * 2 + 2),
        }
      : base;
    if (area.w < 7 || area.h < 7 || area.w > 40 || area.h > 40) continue;
    if (protectedRects.some((p) => intersect(area, p))) continue;
    const parts = inkParts(image, { ...area, bg: first.bg, atoms: null });
    const reason =
      (!extended &&
        (grid(image, parts, first.bg) ||
          (arrowBracket(image, parts, first.bg) ? 'arrow-bracket' : false))) ||
      (listDiagram(parts) ? 'list-diagram' : false) ||
      (!extended && stackedArrows(image, parts, first.bg) ? 'stacked-arrows' : false);
    if (!reason) continue;
    const tight = bounds(parts);
    // Do not take a fragment from a larger text or another overlapping owner.
    if (
      claims.some((c) => !contains(tight, c, 3)) ||
      input.some((c, k) => !indices.includes(k) && !used.has(k) && intersect(tight, c))
    )
      continue;
    // A coherent text residual outside the claimed source is never replaced.
    if (
      claims.some((c) => {
        const m = measure(image, c, 1);
        return m?.glyphBounds && !contains(tight, m.glyphBounds, 1);
      })
    )
      continue;
    const sourceBounds = {
      x: Math.max(0, tight.x - 1),
      y: Math.max(0, tight.y - 1),
      w: tight.w + 2,
      h: tight.h + 2,
    };
    return {
      box: {
        ...first,
        ...sourceBounds,
        sourceBounds,
        atoms: parts,
        componentCount: parts.length,
        shape: 'icon',
        compact: true,
        kind: 'compact-graphic',
        roleEvidence: reason,
        iconSize: Math.min(tight.w, tight.h),
      },
      indices,
    };
  }
  return null;
}
