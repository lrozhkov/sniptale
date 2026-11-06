import {
  resolveAtomCaptionConflicts,
  resolveConnectedCaptionClaims,
  resolveDecorativeLockups,
} from './ownership-ink.mjs';
import { inkRuns } from './ownership-ink.mjs';
import {
  recoverRepeatedNumericText,
  mergeRecoveredTextRows,
  recoverBridgedFontRows,
  recoverTrailingDescenders,
  recoverWeakMediaText,
  recoverClippedInlineGlyphs,
} from './ownership-text-recovery.mjs';
import {
  separateBoundaryDirection,
  resolveRepeatedInlineGraphics,
  completeIconSupport,
  claimCaptionedFigures,
} from './ownership-icons.mjs';
import { resolveEnclosedSymbols } from './enclosed-symbols.mjs';
import { rejectPlanarMedia } from './planar-surfaces.mjs';
import { inkParts, isDirectionalArrow } from './structure.mjs';
import { attachEraseSupport } from './erasures.mjs';
/** Resolve competing surface claims before any source pixels are hidden. */
export function resolveSurfaceClaims(image, media, controls, measure) {
  media = rejectPlanarMedia(image, media, measure);
  const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  const color = (x, y) => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
    const i = (Math.round(y) * image.width + Math.round(x)) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  };
  function boundedFill(box, tolerance = 0) {
    const x = Math.round(box.x),
      y = Math.round(box.y),
      w = Math.round(box.w),
      h = Math.round(box.h);
    if (
      box.kind === 'compound-island'
        ? x < 0 || y < 0 || x + w > image.width || y + h > image.height
        : x < 3 + tolerance ||
          y < 3 + tolerance ||
          x + w + 2 + tolerance >= image.width ||
          y + h + 2 + tolerance >= image.height
    )
      return false;
    const inset = Math.max(3, Math.min(7, Math.floor(Math.min(w, h) * 0.2))),
      scores = [];
    for (const side of ['top', 'bottom', 'left', 'right']) {
      let best = 0;
      for (let offset = -tolerance; offset <= tolerance; offset++) {
        let total = 0,
          edges = 0;
        const length = side === 'top' || side === 'bottom' ? w : h;
        for (let n = inset; n < length - inset; n += 2) {
          const horizontal = side === 'top' || side === 'bottom';
          const edge =
            (side === 'top' ? y : side === 'bottom' ? y + h - 1 : side === 'left' ? x : x + w - 1) +
            offset;
          const step = box.kind === 'compound-island' ? 1 : 2;
          const inward = side === 'top' || side === 'left' ? step : -step;
          const inside = horizontal ? color(x + n, edge + inward) : color(edge + inward, y + n);
          const outside = horizontal ? color(x + n, edge - inward) : color(edge - inward, y + n);
          if (!inside || !outside) continue;
          total++;
          if (distance(inside, outside) >= 9) edges++;
        }
        best = Math.max(best, edges / Math.max(1, total));
      }
      scores.push(best);
    }
    return Math.min(...scores) >= 0.65;
  }
  const outlines = controls.protected.filter((b) => b.kind === 'outline');
  const frames = controls.boundaries.filter(
    (b) =>
      b.kind !== 'control' ||
      outlines.some(
        (o) =>
          Math.abs(o.x - b.x) <= 2 &&
          Math.abs(o.y - b.y) <= 2 &&
          Math.abs(o.w - b.w) <= 4 &&
          Math.abs(o.h - b.h) <= 4
      ) ||
      boundedFill(b)
  );
  const contains = (outer, inner, pad = 0) =>
    inner.x >= outer.x - pad &&
    inner.y >= outer.y - pad &&
    inner.x + inner.w <= outer.x + outer.w + pad &&
    inner.y + inner.h <= outer.y + outer.h + pad;
  const labels = controls.labels.filter((b) =>
    frames.some((f) => f.kind === 'control' && contains(f, b, 1))
  );
  let acceptedMedia = media.filter((owner) => {
    if (owner.kind === 'compound-island' && boundedFill(owner, 2)) return false;
    if (owner.kind !== 'small-image-group') return true;
    return !frames.some((frame) => {
      if (
        frame.kind !== 'control' ||
        frame.w / frame.h < 1.3 ||
        !contains(frame, owner, 2) ||
        !contains(owner, frame, 2)
      )
        return false;
      return labels.some((label) => {
        if (!contains(frame, label)) return false;
        const m = measure(image, label);
        return (
          m &&
          m.glyphs >= 3 &&
          m.baselineAgreement >= 0.8 &&
          m.heightAgreement >= 0.8 &&
          m.stroke / m.xHeight <= 0.4
        );
      });
    });
  });
  // Resolve weak parents only after both planar and control arbitration.
  const surviving = new Set(acceptedMedia);
  acceptedMedia = acceptedMedia.filter(
    (p) =>
      p.kind !== 'compound-island' ||
      (!(p._disconnectedOwners || []).some((s) => surviving.has(s)) &&
        !acceptedMedia.some((s) => {
          if (s.kind === 'compound-island') return false;
          const w = Math.max(0, Math.min(p.x + p.w, s.x + s.w) - Math.max(p.x, s.x));
          const h = Math.max(0, Math.min(p.y + p.h, s.y + s.h) - Math.max(p.y, s.y));
          return w * h >= p.w * p.h * 0.9;
        }))
  );
  acceptedMedia = acceptedMedia.map((p) => {
    if (p.kind !== 'compound-island') return p;
    const { _disconnectedOwners, ...owner } = p;
    return owner;
  });
  return { media: acceptedMedia, controls: { ...controls, boundaries: frames, labels } };
}

const contains = (a, b, pad = 0) =>
  b.x >= a.x - pad &&
  b.y >= a.y - pad &&
  b.x + b.w <= a.x + a.w + pad &&
  b.y + b.h <= a.y + a.h + pad;

/** Resolve leaf ink ownership after proposal classification, on original pixels. */
export function resolveForegroundClaims(
  image,
  input,
  measure,
  background,
  protectedRects = [],
  boundaries = [],
  narrow = []
) {
  // A strip detector can mistake texture above a caption for clipped glyphs.
  // Arbitrate against the independent uncertain owner before attaching erasure.
  // Remove only the weak proposal; do not enlarge the uncertain owner.
  let boxes = input
    .filter(
      (b) =>
        !(
          b.kind === 'boundary-text' &&
          b.shape === 'text' &&
          b.typeMetrics?.foregroundCoverage < 0.5 &&
          input.some((u) => {
            if (u.shape !== 'unknown' || u.roleEvidence !== 'uncertain-color-texture') return false;
            const w = Math.max(0, Math.min(b.x + b.w, u.x + u.w) - Math.max(b.x, u.x));
            const h = Math.max(0, Math.min(b.y + b.h, u.y + u.h) - Math.max(b.y, u.y));
            return w >= b.w * 0.75 && h >= b.h * 0.3;
          })
        )
    )
    .map((b) => ({ ...b }));
  boxes = resolveEnclosedSymbols(image, boxes, measure, inkRuns, protectedRects);
  boxes = separateBoundaryDirection(image, boxes, measure);
  boxes = recoverClippedInlineGlyphs(image, boxes, measure);
  boxes = resolveRepeatedInlineGraphics(image, boxes, measure);
  boxes = recoverRepeatedLineGlyphs(image, boxes, measure, protectedRects, boundaries, narrow);
  boxes = recoverSingleGlyphRows(image, boxes, measure);
  boxes = recoverRepeatedNumericText(image, boxes, measure);
  boxes = recoverWeakMediaText(image, boxes, measure, protectedRects);
  boxes = mergeRecoveredTextRows(image, boxes, measure, protectedRects);
  boxes = recoverBridgedFontRows(image, boxes, measure, protectedRects);
  boxes = recoverTrailingDescenders(image, boxes, measure, protectedRects);
  const owners = [],
    absorbed = new Set();
  boxes = resolveAtomCaptionConflicts(input, boxes, owners, absorbed);
  boxes = resolveConnectedCaptionClaims(image, input, boxes, measure, background, owners, absorbed);
  boxes.push(...owners);
  const decorated = resolveDecorativeLockups(image, boxes, background);
  boxes = mergeRecoveredTextRows(image, decorated, measure, protectedRects);
  boxes = claimCaptionedFigures(image, boxes, protectedRects, boundaries);
  return completeIconSupport(image, boxes).map((b) => attachEraseSupport(image, b));
}

// Separate paired direction components before their containing text is erased.
export function sourceDirectionIcons(image, raw, measure) {
  const candidates = [];
  for (const box of raw) {
    if (box.shape !== 'text') continue;
    const m = measure(image, box);
    if (!m || m.glyphs < 3 || m.baselineAgreement < 0.7 || m.heightAgreement < 0.7) continue;
    const parts = inkParts(image, { ...box, atoms: null })
      .filter((p) => p.n >= 5)
      .sort((a, b) => a.x - b.x);
    for (const part of [parts[0], parts.at(-1)]) {
      if (!part || !isDirectionalArrow(image, { ...part, bg: box.bg })) continue;
      const left = part.x - box.x,
        right = box.x + box.w - part.x - part.w;
      if (Math.min(left, right) > Math.max(3, part.w * 0.4)) continue;
      const label =
        left < right
          ? { ...box, x: part.x + part.w, w: box.x + box.w - part.x - part.w }
          : { ...box, w: part.x - box.x };
      const labelMetrics = measure(image, label);
      if (
        !labelMetrics ||
        labelMetrics.glyphs < 2 ||
        labelMetrics.baselineAgreement < 0.7 ||
        labelMetrics.heightAgreement < 0.7
      )
        continue;
      candidates.push({ ...part, bg: box.bg });
    }
  }
  return candidates
    .filter((a, i) =>
      candidates.some(
        (b, j) =>
          i !== j &&
          Math.abs(a.x - b.x) >= Math.max(a.w, b.w) * 2 &&
          Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) <= Math.max(3, a.h * 0.35) &&
          Math.abs(a.x - b.x) <= Math.max(a.h, b.h) * 20 &&
          Math.min(a.h, b.h) >= Math.max(a.h, b.h) * 0.65
      )
    )
    .map((p) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      bg: p.bg,
      shape: 'icon',
      kind: 'direction-symbol',
      roleEvidence: 'direction-symbol',
    }));
}

export function confirmFaintColumn(box, input) {
  const m = box.typeMetrics;
  if (!m || !box.textConfidence || m.glyphs < 3 || m.xHeight < 4 || box.w < m.xHeight * 4)
    return false;
  const peers = input.filter(
    (q) =>
      q !== box &&
      q.shape === 'text' &&
      q.textConfidence &&
      q.typeMetrics?.glyphs >= 3 &&
      Math.abs(q.x - box.x) <= 6 &&
      Math.abs(q.y - box.y) <= 160 &&
      Math.max(...q.bg.map((v, c) => Math.abs(v - box.bg[c]))) <= 8 &&
      q.typeMetrics.xHeight >= m.xHeight &&
      q.typeMetrics.xHeight <= m.xHeight * 3
  );
  if (peers.length < 3) return false;
  const sizes = peers
    .map((q) => q.textSize)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (sizes.length) box.textSize = sizes[Math.floor(sizes.length / 2)];
  box.roleEvidence = 'text-faint-column';
  return true;
}

/** A status claim cannot own a fragment of a larger connected graphic. */
export function resolveOutlineClaims(image, boxes, states, background) {
  return states.filter((state) => {
    if (state.kind === 'outline') {
      const owner = boxes.find(
        (b) =>
          b.shape === 'icon' &&
          b.roleEvidence === 'layered-contours' &&
          contains(b.sourceBounds || b, state) &&
          !boxes.some((t) => t.shape === 'text' && contains(state, t))
      );
      if (owner) {
        const bg = background(image, state),
          ink = (x, y) => {
            const i = (y * image.width + x) * 4;
            return Math.max(...bg.map((v, k) => Math.abs(v - image.data[i + k]))) >= 18;
          };
        const corner = (x, y, dx, dy) => {
          for (let yy = 0; yy < 3; yy++)
            for (let xx = 0; xx < 3; xx++) if (ink(x + dx * xx, y + dy * yy)) return true;
          return false;
        };
        // An inner curved contour belongs to its established graphic owner;
        // this cannot remove protection from an independent rounded control.
        if (
          !corner(state.x, state.y, 1, 1) ||
          !corner(state.x + state.w - 1, state.y, -1, 1) ||
          !corner(state.x, state.y + state.h - 1, 1, -1) ||
          !corner(state.x + state.w - 1, state.y + state.h - 1, -1, -1)
        )
          return false;
      }
    }
    return true;
  });
}

function narrowTextCandidates(image, input, measure, narrow, overlaps) {
  const extra = [],
    extraMetric = new Map(),
    seen = new Set();
  for (const b of narrow) {
    if (input.some((q) => contains(q, b))) continue;
    const candidate = { ...b, shape: 'unknown' },
      m = measure(image, { ...(b.sourceBounds || b), bg: b.bg }, 1),
      g = m?.glyphBounds;
    if (!g || m.glyphs !== 1 || input.some((q) => overlaps(q, g))) continue;
    const key = `${g.x},${g.y},${g.w},${g.h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(candidate);
    extraMetric.set(candidate, m);
  }
  return { extra, extraMetric };
}

function sameGlyphRaster(image, metric, a, b) {
  const ga = metric.get(a)?.glyphBounds,
    gb = metric.get(b)?.glyphBounds;
  if (!ga || !gb || ga.w !== gb.w || ga.h !== gb.h) return false;
  let error = 0;
  for (let y = 0; y < ga.h; y++)
    for (let x = 0; x < ga.w; x++) {
      const ia = ((ga.y + y) * image.width + ga.x + x) * 4,
        ib = ((gb.y + y) * image.width + gb.x + x) * 4;
      for (let c = 0; c < 3; c++) error += Math.abs(image.data[ia + c] - image.data[ib + c]);
    }
  return error / (ga.w * ga.h * 3) <= 8;
}

function textFlowOpening(image, row, box, metric, measure) {
  const tolerance = Math.max(3, metric.stroke * 2);
  if (Math.abs(row.x - box.x) <= tolerance) return row;
  if (row.x < box.x - tolerance) return null;
  const region = { ...row, x: box.x, w: row.x + row.w - box.x };
  const m = measure(image, region);
  if (
    !m ||
    m.glyphs < 5 ||
    m.baselineAgreement < 0.8 ||
    m.heightAgreement < 0.8 ||
    m.foregroundCoverage < 0.9 ||
    Math.abs(m.glyphBounds.x - box.x) > tolerance ||
    m.stroke / metric.stroke < 0.7 ||
    m.stroke / metric.stroke > 1.4
  )
    return null;
  return { ...region, typeMetrics: m };
}

function recoverRepeatedLineGlyphs(image, input, measure, protectedRects, boundaries, narrow) {
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const { extra, extraMetric } = narrowTextCandidates(image, input, measure, narrow, overlaps);
  const all = [...input, ...extra];
  const textHeight = Math.max(
    0,
    ...input
      .filter((b) => b.shape === 'text' && b.textConfidence)
      .map((b) => b.typeMetrics?.upperHeight || b.typeMetrics?.glyphBounds?.h || 0)
  );
  const candidates = all.filter(
    (b) =>
      b.shape === 'unknown' &&
      !b.roleEvidence &&
      b.w <= textHeight &&
      b.h <= textHeight * 2 &&
      !protectedRects.some((q) => overlaps(q, b))
  );
  const metric = new Map(
    candidates.map((b) => [
      b,
      extraMetric.get(b) || measure(image, { ...(b.sourceBounds || b), bg: b.bg }, 1),
    ])
  );
  const context = (box) => {
    const m = metric.get(box),
      glyph = m?.glyphBounds;
    if (
      !glyph ||
      m.glyphs !== 1 ||
      m.foregroundCoverage < 0.9 ||
      m.stroke / m.xHeight > 0.4 ||
      glyph.w > glyph.h * 0.55
    )
      return box;
    const rows = input
      .filter((q) => {
        const t = q.typeMetrics;
        return (
          q.shape === 'text' &&
          q.textConfidence &&
          t?.glyphs >= 5 &&
          q.y < box.y &&
          q.x >= box.x - m.xHeight &&
          q.x <= box.x + m.xHeight * 4 &&
          t.stroke / m.stroke >= 0.7 &&
          t.stroke / m.stroke <= 1.4 &&
          glyph.h >= t.xHeight &&
          glyph.h <= t.xHeight * 2
        );
      })
      .sort((a, b) => b.y - a.y);
    const first = rows[0];
    if (!first) return box;
    const pitch = box.y - first.y;
    if (pitch < glyph.h || pitch > glyph.h * 2.5) return box;
    const color = (b) =>
      inkParts(image, { ...b, atoms: null })
        .filter((p) => p.h >= Math.min(glyph.h, b.typeMetrics?.xHeight || glyph.h) * 0.7)
        .map((p) => p.rgb);
    const own = color(box)[0];
    const indentTolerance = Math.max(3, m.stroke * 2);
    if (!own || first.x < box.x + indentTolerance) return box;
    const chain = [first];
    let opening = null;
    for (let line = 2; line <= 9; line++) {
      const next = rows.find(
        (q) => Math.abs(box.y - q.y - pitch * line) <= Math.max(3, pitch * 0.2)
      );
      if (!next) break;
      const openingRow =
        chain.length >= 2 && Math.max(...next.bg.map((v, c) => Math.abs(v - box.bg[c]))) <= 8
          ? textFlowOpening(image, next, box, m, measure)
          : null;
      if (
        openingRow &&
        color(openingRow).some((p) => Math.max(...p.map((v, c) => Math.abs(v - own[c]))) <= 32)
      ) {
        opening = openingRow;
        break;
      }
      if (Math.abs(next.x - first.x) > indentTolerance) break;
      chain.push(next);
    }
    if (
      !opening ||
      boundaries.some((f) => overlaps(f, box) && [...chain, opening].some((q) => !contains(f, q)))
    )
      return box;
    return first;
  };
  const supported = new Map(
    candidates.map((b) => [b, context(b)]).filter(([, row]) => row && row.shape === 'text')
  );
  return all
    .map((box) => {
      const first = supported.get(box);
      if (
        !first ||
        ![...supported.keys()].some(
          (q) =>
            q !== box &&
            Math.abs(q.x - box.x) <= 2 &&
            Math.abs(q.y - box.y) > box.h * 2 &&
            sameGlyphRaster(image, metric, box, q)
        )
      )
        return box;
      const m = metric.get(box);
      const result = {
        ...box,
        shape: 'text',
        kind: 'row-text',
        roleEvidence: 'text-row',
        typeMetrics: m,
        textConfidence: true,
        contrast: m.foregroundContrast,
        textSize: first.textSize,
        textCenterY: box.y + box.h / 2,
      };
      delete result.sourceBounds;
      delete result.iconSize;
      return result;
    })
    .filter((b) => input.includes(b) || !extra.includes(b) || b.shape === 'text');
}

function matchingInlineInk(image, glyph, part, bg) {
  if (Math.max(...glyph.rgb.map((v, c) => Math.abs(v - part.rgb[c]))) > 32) return false;
  if (
    Math.min(glyph.w, part.w) < Math.max(glyph.w, part.w) * 0.8 ||
    Math.min(glyph.h, part.h) < Math.max(glyph.h, part.h) * 0.8
  )
    return false;
  const foreground = (x, y) => {
    const i = (y * image.width + x) * 4;
    return image.data[i + 3] >= 128 && bg.some((v, c) => Math.abs(v - image.data[i + c]) > 40);
  };
  let common = 0,
    total = 0;
  for (let y = 0; y < glyph.h; y++)
    for (let x = 0; x < glyph.w; x++) {
      const a = foreground(glyph.x + x, glyph.y + y);
      const b = foreground(
        part.x + Math.min(part.w - 1, Math.floor(((x + 0.5) * part.w) / glyph.w)),
        part.y + Math.min(part.h - 1, Math.floor(((y + 0.5) * part.h) / glyph.h))
      );
      if (a || b) total++;
      if (a && b) common++;
    }
  return total > 0 && common / total >= 0.78;
}

function inlineSingleGlyphPeers(image, box, m, input) {
  const glyph = m.glyphBounds,
    xh = m.xHeight;
  const peers = input.filter((q) => {
    const t = q.typeMetrics;
    return (
      q.shape === 'text' &&
      q.textConfidence &&
      t?.glyphs >= 2 &&
      Math.max(...q.bg.map((v, c) => Math.abs(v - box.bg[c]))) <= 8 &&
      Math.min(t.xHeight, xh) >= Math.max(t.xHeight, xh) * 0.75 &&
      Math.min(t.stroke, m.stroke) >= Math.max(t.stroke, m.stroke) * 0.65 &&
      Math.abs(q.y + q.h / 2 - box.y - box.h / 2) <= xh * 0.5
    );
  });
  const left = peers
    .filter((q) => q.x + q.w <= box.x && box.x - q.x - q.w <= xh * 1.5)
    .sort((a, b) => b.x + b.w - a.x - a.w)[0];
  const right = peers
    .filter((q) => q.x >= box.x + box.w && q.x - box.x - box.w <= xh * 1.5)
    .sort((a, b) => a.x - b.x)[0];
  if (!left || !right) return [];
  // Local font evidence comes from the source row, not a stored alphabet or symbol template.
  const ink = [left, right].flatMap((q) => inkParts(image, { ...q, atoms: null }));
  const bodies = ink.filter((p) => p.h >= xh * 0.7 && p.h <= xh * 1.6);
  const bottoms = bodies.map((p) => p.y + p.h).sort((a, b) => a - b);
  if (
    bottoms.length < 3 ||
    Math.abs(bottoms[Math.floor(bottoms.length / 2)] - glyph.y - glyph.h) > xh * 0.2
  )
    return [];
  const source = inkParts(image, { ...glyph, bg: box.bg });
  const count = source.reduce((n, p) => n + p.n, 0);
  if (!count) return [];
  const rgb = [0, 1, 2].map((c) => source.reduce((n, p) => n + p.rgb[c] * p.n, 0) / count);
  if (!ink.some((p) => matchingInlineInk(image, { ...glyph, rgb }, p, box.bg))) return [];
  return [left, right];
}

function recoverSingleGlyphRows(image, input, measure) {
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return input.map((box) => {
    if (!['icon', 'unknown'].includes(box.shape) || box.roleEvidence || box.kind === 'control-icon')
      return box;
    const original = box.sourceBounds || box,
      m = measure(image, { ...original, bg: box.bg }, 1);
    if (!m || m.glyphs !== 1 || m.xHeight < 5 || m.stroke / m.xHeight > 0.4) return box;
    const glyph = m.glyphBounds,
      bottom = glyph.y + glyph.h;
    let peers =
      box.w > 32 || box.h > 32
        ? []
        : input.filter((q) => {
            const t = q.typeMetrics;
            if (
              q === box ||
              q.shape !== 'text' ||
              !q.textConfidence ||
              !t ||
              t.glyphs < 2 ||
              !t.glyphBounds
            )
              return false;
            return (
              Math.abs(q.x - box.x) <= m.xHeight * 24 &&
              Math.max(...q.bg.map((v, c) => Math.abs(v - box.bg[c]))) <= 8 &&
              Math.min(t.xHeight, m.xHeight) >= Math.max(t.xHeight, m.xHeight) * 0.75 &&
              Math.abs(t.glyphBounds.y + t.glyphBounds.h - bottom) <= 1.5 &&
              Math.abs(q.y + q.h / 2 - box.y - box.h / 2) <= 3
            );
          });
    if (peers.length < 4 || !peers.some((q) => q.x < box.x) || !peers.some((q) => q.x > box.x))
      peers = inlineSingleGlyphPeers(image, box, m, input);
    if (!peers.length) return box;
    const stroke = median(peers.map((q) => q.typeMetrics.stroke));
    if (m.stroke / stroke < 0.65 || m.stroke / stroke > 1.5) return box;
    const result = {
      ...box,
      shape: 'text',
      kind: 'row-text',
      roleEvidence: 'text-row',
      typeMetrics: m,
      textConfidence: true,
      contrast: m.foregroundContrast,
      textSize: median(peers.map((q) => q.textSize)),
      textCenterY: median(peers.map((q) => q.textCenterY ?? q.y + q.h / 2)),
    };
    delete result.sourceBounds;
    delete result.iconSize;
    return result;
  });
}
