import { peakContrast } from './structure-topology.mjs';
import { inkParts } from './structure.mjs';
const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
/** Preserve a mixed icon claim when its source includes a complete key frame. */
export function preserveMixedFrameClaims(boxes, frames, image) {
  return boxes.map((original) => {
    let box = original;
    if (box.shape !== 'icon' || !box.sourceRuns || !box.sourceBounds) return box;
    const s = box.sourceBounds;
    const mixed = frames.some((f) => isMixedFrameClaim(box, s, f));
    if (mixed)
      return {
        ...box,
        shape: 'unknown',
        kind: 'mixed-frame-claim',
        roleEvidence: 'mixed-frame-claim',
      };
    const owned = new Set();
    for (const [y, x, w] of box.sourceRuns)
      for (let px = x; px < x + w; px++) owned.add(`${px},${y}`);
    const added = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (
        f.kind !== 'outline' ||
        !f.sourceRuns ||
        f.w < box.w * 1.3 ||
        f.h > box.h * 1.2 ||
        !(f.x <= box.x - 4 || f.x + f.w >= box.x + box.w + 4)
      )
        continue;
      const edges = frameEdgeSupport(image, box, f);
      if (
        edges[0].size >= f.w * 0.75 &&
        edges[1].size >= f.w * 0.75 &&
        edges[2].size >= f.h * 0.75 &&
        edges[3].size >= f.h * 0.75
      )
        continue;
      const candidates = adjacentFramePoints(box, f, owned);
      if (candidates.length < 4) continue;
      const remaining = unclaimedFrameRuns(f, candidates);
      frames[i] = { ...f, sourceRuns: remaining };
      for (const [x, y] of candidates)
        if (!owned.has(`${x},${y}`)) {
          owned.add(`${x},${y}`);
          added.push([y, x, 1]);
        }
    }
    if (added.length)
      box = {
        ...box,
        sourceRuns: [...box.sourceRuns, ...added],
        eraseRuns: [...(box.eraseRuns || box.sourceRuns), ...added],
      };
    return box;
  });
}
/** Preserve a thin closed frame proved on four edges around a text child. */
export function findTextFrames(image, boxes) {
  const { width, height, data } = image,
    out = [];
  const get = (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  for (const b of boxes) {
    if (
      !['text', 'unknown', 'icon'].includes(b.shape) ||
      b.kind === 'control-icon' ||
      (b.shape === 'icon' && b.roleEvidence) ||
      b.roleEvidence === 'control-exterior' ||
      b.h > 65 ||
      b.w > 600
    )
      continue;
    const sx = Math.min(width - 3, Math.max(2, Math.round(b.x + b.w * 0.5)));
    for (let top = Math.max(2, b.y - 8); top <= Math.min(height - 3, b.y + 1); top++) {
      const color = get(sx, top);
      if (distance(color, get(sx, top - 2)) < 9 || distance(color, get(sx, top + 2)) < 9) continue;
      const extent = frameTopEdgeExtent(get, width, b, sx, top, color);
      if (!extent) continue;
      const { left, right } = extent;
      for (
        let bottom = Math.max(top + 13, b.y + b.h - 2);
        bottom <= Math.min(height - 3, b.y + b.h + 9, top + 80);
        bottom++
      ) {
        if (!hasFrameBottomEdge(get, left, right, bottom, color)) continue;
        // Find the physical vertical strokes. Rounded horizontal edges can
        // start inside the side strokes by several pixels.
        const side = (edge, sign) =>
          findPhysicalFrameSide(get, width, top, bottom, color, edge, sign);
        const physicalLeft = side(left, 1),
          physicalRight = side(right, -1);
        if (physicalLeft === null || physicalRight === null || physicalRight <= physicalLeft)
          continue;
        if (out.some((q) => Math.abs(q.x - physicalLeft) <= 3 && Math.abs(q.y - top) <= 3)) break;
        const runs = sampleFrameBorderRuns(
          get,
          width,
          height,
          top,
          bottom,
          physicalLeft,
          physicalRight,
          color,
          b.bg
        );
        if (
          runs.reduce((n, r) => n + r[2], 0) <
          (physicalRight - physicalLeft + 1 + (bottom - top + 1)) * 1.3
        )
          continue;
        out.push({
          x: physicalLeft,
          y: top,
          w: physicalRight - physicalLeft + 1,
          h: bottom - top + 1,
          kind: 'outline',
          sourceRuns: runs,
        });
        break;
      }
    }
  }
  return out;
}

/** Split a mostly enclosed text proposal at a proved frame's interior. */
export function constrainFrameChildren(image, boxes, frames) {
  const output = [];
  for (const box of boxes) {
    if (box.shape !== 'text') {
      output.push(box);
      continue;
    }
    const frame = frames.find((f) => {
      const ix = Math.max(box.x, f.x + 2),
        right = Math.min(box.x + box.w, f.x + f.w - 2);
      const iy = Math.max(box.y, f.y + 1),
        bottom = Math.min(box.y + box.h, f.y + f.h - 1);
      return (
        right > ix &&
        bottom > iy &&
        (right - ix) * (bottom - iy) >= box.w * box.h * 0.65 &&
        box.x >= f.x - 2 &&
        box.y >= f.y - 2 &&
        box.y + box.h <= f.y + f.h + 2
      );
    });
    if (!frame) {
      output.push(box);
      continue;
    }
    const left = Math.max(box.x, frame.x + 2),
      right = Math.min(box.x + box.w, frame.x + frame.w - 2);
    const top = Math.max(box.y, frame.y + 1),
      bottom = Math.min(box.y + box.h, frame.y + frame.h - 1);
    if (left === box.x && right === box.x + box.w && top === box.y && bottom === box.y + box.h) {
      output.push(box);
      continue;
    }
    const child = {
      ...box,
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
      supportConstraint: { x: frame.x + 2, y: frame.y + 1, w: frame.w - 4, h: frame.h - 2 },
    };
    for (const key of [
      'atoms',
      'typeMetrics',
      'textCenterY',
      'rowTextSize',
      'textSize',
      'contrast',
      'sourceBounds',
      'sourceRuns',
      'eraseRuns',
      'erasePlane',
    ])
      delete child[key];
    output.push(child);
    output.push(...frameExteriorClaims(box, frame));
  }
  return output;
}

function caretGeometry(image, box) {
  const peak = peakContrast(image, box);
  const rows = [];
  let left = image.width,
    right = 0,
    top = image.height,
    bottom = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    const xs = [];
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * image.width + x) * 4;
      if (
        Math.max(...box.bg.map((v, c) => Math.abs(v - image.data[i + c]))) >
        Math.max(20, peak * 0.35)
      )
        xs.push(x);
    }
    if (xs.length) {
      rows.push({ span: xs.at(-1) - xs[0] + 1, center: (xs.at(-1) + xs[0]) / 2 });
      left = Math.min(left, xs[0]);
      right = Math.max(right, xs.at(-1));
      top = Math.min(top, y);
      bottom = y;
    }
  }
  const w = right - left + 1,
    h = bottom - top + 1;
  if (
    rows.length < 3 ||
    w < 5 ||
    w / h < 1.3 ||
    w / h > 3 ||
    Math.max(...rows.map((r) => r.center)) - Math.min(...rows.map((r) => r.center)) > 1.5
  )
    return null;
  const taper = (profile) =>
    profile[0].span >= w * 0.7 &&
    profile.at(-1).span <= Math.max(3, w * 0.4) &&
    profile.slice(1).every((r, i) => r.span <= profile[i].span + 1);
  if (!taper(rows) && !taper([...rows].reverse())) return null;
  return { left, right, top, bottom, w, h };
}

/** A short centered chevron after a text child in a closed control is an icon. */
export function recoverFramedCarets(image, boxes, frames, measure) {
  return boxes.map((box) => {
    if (box.shape !== 'unknown' || box.roleEvidence || box.w > 24 || box.h > 18 || !box.bg)
      return box;
    const caret = caretGeometry(image, box);
    if (!caret) return box;
    const { left, right, top, bottom, w, h } = caret;
    const frame = frames.find(
      (f) =>
        f.w > f.h * 1.8 &&
        left > f.x + 1 &&
        right < f.x + f.w - 1 &&
        top > f.y &&
        bottom < f.y + f.h - 1 &&
        f.x + f.w - right <= Math.max(8, f.h * 0.65)
    );
    if (!frame) return box;
    const label = boxes.find(
      (q) =>
        q !== box &&
        q.shape === 'text' &&
        q.x >= frame.x &&
        q.x + q.w < left &&
        q.y >= frame.y &&
        q.y + q.h <= frame.y + frame.h &&
        Math.abs(q.y + q.h / 2 - (top + bottom) / 2) <= Math.max(3, q.h * 0.25) &&
        (() => {
          const m = q.typeMetrics || measure(image, q);
          return (
            m &&
            m.glyphs >= 2 &&
            m.baselineAgreement >= 0.7 &&
            m.heightAgreement >= 0.7 &&
            h <= m.xHeight * 0.75 + 1
          );
        })()
    );
    if (!label) return box;
    const bounds = {
      x: Math.max(frame.x + 1, left - 2),
      y: Math.max(frame.y + 1, top - 2),
      w: Math.min(frame.x + frame.w - 1, right + 3) - Math.max(frame.x + 1, left - 2),
      h: Math.min(frame.y + frame.h - 1, bottom + 3) - Math.max(frame.y + 1, top - 2),
    };
    return {
      ...box,
      ...bounds,
      shape: 'icon',
      kind: 'control-caret',
      roleEvidence: 'framed-caret',
      sourceBounds: { ...bounds },
      compact: true,
      iconSize: Math.max(4, 2 * Math.round(w * 0.4)),
    };
  });
}

/** Resolve a complete short label inside a confirmed frame; keep uncertain labels whole. */
export function recoverFramedLabels(image, boxes, frames, measure) {
  let result = [...boxes];
  for (const frame of frames) {
    if (frame.w / frame.h < 1.3 || frame.w / frame.h > 5) continue;
    const inner = { x: frame.x + 2, y: frame.y + 2, w: frame.w - 4, h: frame.h - 4 };
    const contained = result.filter(
      (b) =>
        b.x >= frame.x - 2 &&
        b.y >= frame.y - 2 &&
        b.x + b.w <= frame.x + frame.w + 2 &&
        b.y + b.h <= frame.y + frame.h + 2 &&
        b.y + b.h > inner.y &&
        b.y < inner.y + inner.h
    );
    if (
      !contained.length ||
      contained.some(
        (b) => b.roleEvidence || b.kind === 'control-icon' || ['image', 'graphic'].includes(b.shape)
      )
    )
      continue;
    const reference = contained.find((b) => b.bg);
    if (!reference) continue;
    if (!sampleFrameInteriorSurface(image, inner)) continue;
    // A separate suffix is not a third letter of a short control label.
    const parts = inkParts(image, { ...inner, atoms: null })
        .filter((p) => p.n >= 3)
        .sort((a, b) => a.x - b.x),
      suffix = parts.at(-1);
    if (parts.length >= 2 && suffix && frame.w > frame.h * 1.8) {
      const suffixClaim = framedLabelSuffix(image, inner, frame, parts, suffix, measure);
      if (suffixClaim) {
        const { tail, label, caret, m } = suffixClaim;
        result = publishFramedLabelSuffix(result, contained, inner, frame, label, tail, caret, m);
        continue;
      }
    }
    result = resolveFramedLabelRegion(image, result, contained, inner, measure);
  }
  return result;
}

function isMixedFrameClaim(box, s, f) {
  if (
    f.kind !== 'outline' ||
    f.w < 16 ||
    f.h < 16 ||
    f.w > 52 ||
    f.h > 52 ||
    f.w / f.h < 0.7 ||
    f.w / f.h > 1.4
  )
    return false;
  if (s.x > f.x || s.y > f.y || s.x + s.w < f.x + f.w || s.y + s.h < f.y + f.h) return false;
  if (s.x >= f.x - 2 && s.y >= f.y - 2 && s.x + s.w <= f.x + f.w + 2 && s.y + s.h <= f.y + f.h + 2)
    return false;
  const side = Math.min(box.w, box.h, box.iconSize || Math.min(box.w, box.h));
  const x = Math.round(box.x + (box.w - side) / 2),
    y = Math.round(box.y + (box.h - side) / 2);
  if (!(x < f.x + 2 || x + side > f.x + f.w - 2 || y < f.y + 2 || y + side > f.y + f.h - 2))
    return false;
  let top = 0,
    bottom = 0,
    left = 0,
    right = 0,
    inside = 0,
    outside = 0;
  for (const [py, start, len] of box.sourceRuns)
    for (let px = start; px < start + len; px++) {
      if (px >= f.x + 2 && px < f.x + f.w - 2 && Math.abs(py - f.y) <= 2) top++;
      if (px >= f.x + 2 && px < f.x + f.w - 2 && Math.abs(py - (f.y + f.h - 1)) <= 2) bottom++;
      if (py >= f.y + 2 && py < f.y + f.h - 2 && Math.abs(px - f.x) <= 2) left++;
      if (py >= f.y + 2 && py < f.y + f.h - 2 && Math.abs(px - (f.x + f.w - 1)) <= 2) right++;
      if (px > f.x + 2 && px < f.x + f.w - 3 && py > f.y + 2 && py < f.y + f.h - 3) inside++;
      if (px < f.x - 2 || px >= f.x + f.w + 2 || py < f.y - 2 || py >= f.y + f.h + 2) outside++;
    }
  return (
    top >= f.w * 0.6 &&
    bottom >= f.w * 0.6 &&
    left >= f.h * 0.6 &&
    right >= f.h * 0.6 &&
    inside >= 3 &&
    outside >= 3
  );
}

function frameEdgeSupport(image, box, f) {
  const edges = [new Set(), new Set(), new Set(), new Set()];
  for (const [y, x, w] of f.sourceRuns)
    for (let px = x; px < x + w; px++) {
      if (image && box.bg) {
        const i = (y * image.width + px) * 4;
        if (Math.max(...box.bg.map((v, c) => Math.abs(v - image.data[i + c]))) < 9) continue;
      }
      if (Math.abs(y - f.y) <= 1 && px >= f.x && px < f.x + f.w) edges[0].add(px);
      if (Math.abs(y - (f.y + f.h - 1)) <= 1 && px >= f.x && px < f.x + f.w) edges[1].add(px);
      if (Math.abs(px - f.x) <= 1 && y >= f.y && y < f.y + f.h) edges[2].add(y);
      if (Math.abs(px - (f.x + f.w - 1)) <= 1 && y >= f.y && y < f.y + f.h) edges[3].add(y);
    }
  return edges;
}

function adjacentFramePoints(box, f, owned) {
  const candidates = [];
  for (const [y, x, w] of f.sourceRuns)
    for (let px = x; px < x + w; px++) {
      if (px < box.x || px >= box.x + box.w || y < box.y || y >= box.y + box.h) continue;
      let adjacent = false;
      for (let dy = -1; dy <= 1 && !adjacent; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (owned.has(`${px + dx},${y + dy}`)) {
            adjacent = true;
            break;
          }
      if (adjacent) candidates.push([px, y]);
    }
  return candidates;
}

function unclaimedFrameRuns(f, candidates) {
  const claimed = new Set(candidates.map(([x, y]) => `${x},${y}`)),
    remaining = [];
  for (const [y, x, w] of f.sourceRuns) {
    let start = -1;
    for (let px = x; px <= x + w; px++) {
      const keep = px < x + w && !claimed.has(`${px},${y}`);
      if (keep && start < 0) start = px;
      if (!keep && start >= 0) {
        remaining.push([y, start, px - start]);
        start = -1;
      }
    }
  }
  return remaining;
}

function findPhysicalFrameSide(get, width, top, bottom, color, edge, sign) {
  let best = null;
  for (let x = Math.max(1, edge - 3); x <= Math.min(width - 2, edge + 3); x++) {
    let n = 0,
      total = 0;
    for (let y = top + 3; y < bottom - 2; y++) {
      total++;
      if (distance(get(x, y), color) < 18 && distance(get(x + sign * 3, y), color) > 9) n++;
    }
    if (!best || n > best.n || (n === best.n && sign < 0)) best = { x, n, total };
  }
  return best && best.n / Math.max(1, best.total) >= 0.75 ? best.x : null;
}

function sampleFrameBorderRuns(
  get,
  width,
  height,
  top,
  bottom,
  physicalLeft,
  physicalRight,
  color,
  bg
) {
  const runs = [];
  const x0 = Math.max(0, physicalLeft - 1),
    x1 = Math.min(width - 1, physicalRight + 1);
  for (let y = Math.max(0, top - 1); y <= Math.min(height - 1, bottom + 1); y++) {
    let start = -1;
    for (let x = x0; x <= x1; x++) {
      const border =
        y <= top + 1 || y >= bottom - 1 || x <= physicalLeft + 1 || x >= physicalRight - 1;
      const p = get(x, y),
        direction = color.map((v, c) => v - bg[c]),
        length = direction.reduce((n, v) => n + v * v, 0);
      const alpha = length ? p.reduce((n, v, c) => n + (v - bg[c]) * direction[c], 0) / length : 0;
      const on =
        border &&
        alpha > 0.08 &&
        alpha < 1.3 &&
        Math.max(...p.map((v, c) => Math.abs(v - bg[c] - alpha * direction[c]))) < 12;
      if (on && start < 0) start = x;
      if (start >= 0 && (!on || x === x1)) {
        runs.push([y, start, x - start + (on ? 1 : 0)]);
        start = -1;
      }
    }
  }
  return runs;
}

/** Preserve independently measured text outside an admitted outlined control. */
export function splitTextOutsideFrame(image, box, frame, measure) {
  const bottom = box.y + box.h,
    right = box.x + box.w;
  const middleTop = Math.max(box.y, frame.y),
    middleBottom = Math.min(bottom, frame.y + frame.h);
  const regions = [
    { x: box.x, y: box.y, w: box.w, h: Math.min(bottom, frame.y) - box.y },
    {
      x: box.x,
      y: Math.max(box.y, frame.y + frame.h),
      w: box.w,
      h: bottom - Math.max(box.y, frame.y + frame.h),
    },
    { x: box.x, y: middleTop, w: Math.min(right, frame.x) - box.x, h: middleBottom - middleTop },
    {
      x: Math.max(box.x, frame.x + frame.w),
      y: middleTop,
      w: right - Math.max(box.x, frame.x + frame.w),
      h: middleBottom - middleTop,
    },
  ];
  return regions
    .filter((r) => r.w > 0 && r.h > 0)
    .flatMap((r) => {
      const atoms = inkParts(image, { ...r, bg: box.bg, atoms: null });
      if (!atoms.length) return [];
      const x = Math.max(r.x, Math.min(...atoms.map((p) => p.x)) - 1),
        y = Math.max(r.y, Math.min(...atoms.map((p) => p.y)) - 1),
        edge = Math.min(r.x + r.w, Math.max(...atoms.map((p) => p.x + p.w)) + 1),
        base = Math.min(r.y + r.h, Math.max(...atoms.map((p) => p.y + p.h)) + 1);
      const candidate = {
        x,
        y,
        w: edge - x,
        h: base - y,
        bg: box.bg,
        shape: 'unknown',
        kind: 'frame-exterior',
        componentCount: atoms.length,
        atoms,
      };
      let metric = measure(image, candidate, 1);
      if (!metric || metric.baselineAgreement < 0.7 || metric.heightAgreement < 0.7)
        return [candidate];
      if (metric.glyphs === 1 && atoms.length === 1) {
        const p = atoms[0];
        // A square or wide single contour is not independent text evidence.
        if (p.w > p.h * 0.9) return [candidate];
        metric = {
          ...metric,
          xHeight: p.h,
          upperHeight: p.h,
          glyphBounds: { x: p.x, y: p.y, w: p.w, h: p.h },
          inferredFromContext: true,
        };
      }
      if (metric.stroke / metric.xHeight <= 0.4) {
        candidate.shape = 'text';
        candidate.typeMetrics = metric;
      }
      return [candidate];
    });
}

function frameExteriorClaims(box, frame) {
  const output = [];
  for (const [x, w] of [
    [box.x, Math.max(0, frame.x - box.x)],
    [
      Math.max(box.x, frame.x + frame.w),
      Math.max(0, box.x + box.w - Math.max(box.x, frame.x + frame.w)),
    ],
  ]) {
    if (w <= 0) continue;
    const exterior = {
      ...box,
      x,
      w,
      shape: 'unknown',
      kind: 'control-exterior',
      roleEvidence: 'control-exterior',
      sourceBounds: Object.freeze({ x, y: box.y, w, h: box.h }),
    };
    for (const key of [
      'atoms',
      'typeMetrics',
      'textConfidence',
      'textCenterY',
      'rowTextSize',
      'textSize',
      'contrast',
      'sourceRuns',
      'eraseRuns',
      'erasePlane',
      'iconSize',
      'supportConstraint',
    ])
      delete exterior[key];
    output.push(exterior);
  }
  return output;
}

function sampleFrameInteriorSurface(image, inner) {
  const bins = new Map();
  for (let y = inner.y; y < inner.y + inner.h; y++)
    for (let x = inner.x; x < inner.x + inner.w; x++) {
      const i = (y * image.width + x) * 4,
        rgb = [image.data[i], image.data[i + 1], image.data[i + 2]],
        key = rgb.map((v) => v >> 4).join(',');
      const bin = bins.get(key) || [];
      bin.push(rgb);
      bins.set(key, bin);
    }
  const surface = [...bins.values()].sort((a, b) => b.length - a.length)[0];
  if (!surface || surface.length < inner.w * inner.h * 0.5) return false;
  inner.bg = [0, 1, 2].map(
    (c) => surface.map((p) => p[c]).sort((a, b) => a - b)[Math.floor(surface.length / 2)]
  );
  return true;
}

function framedLabelSuffix(image, inner, frame, parts, suffix, measure) {
  const tail = {
      x: suffix.x - 1,
      y: suffix.y - 1,
      w: suffix.w + 2,
      h: suffix.h + 2,
      bg: inner.bg,
    },
    caret = caretGeometry(image, tail),
    prefix = parts.slice(0, -1);
  const left = Math.min(...prefix.map((p) => p.x)),
    top = Math.min(...prefix.map((p) => p.y)),
    right = Math.max(...prefix.map((p) => p.x + p.w)),
    bottom = Math.max(...prefix.map((p) => p.y + p.h));
  const label = {
      x: left - 1,
      y: top - 1,
      w: right - left + 2,
      h: bottom - top + 2,
      bg: inner.bg,
    },
    m = measure(image, label);

  if (
    !(
      caret &&
      suffix.x - right >= Math.max(3, (bottom - top) * 0.5) &&
      frame.x + frame.w - (suffix.x + suffix.w) <= Math.max(8, frame.h * 0.65) &&
      m &&
      m.glyphs >= 2 &&
      m.foregroundCoverage >= 0.8 &&
      m.baselineAgreement >= 0.8 &&
      m.heightAgreement >= 0.8 &&
      m.stroke / m.xHeight <= 0.4 &&
      caret.h <= m.xHeight * 0.75 + 1 &&
      Math.abs((caret.top + caret.bottom) / 2 - (top + bottom) / 2) <=
        Math.max(3, (bottom - top) * 0.25)
    )
  )
    return null;
  return { tail, label, caret, m };
}

function hasFrameBottomEdge(get, left, right, bottom, color) {
  let score = 0,
    total = 0;
  for (let x = left + 3; x < right - 2; x++) {
    total++;
    if (distance(get(x, bottom), color) < 18 && distance(get(x, bottom - 2), color) > 9) score++;
  }
  return score / Math.max(1, total) >= 0.85;
}

function publishFramedLabelSuffix(result, contained, inner, frame, label, tail, caret, m) {
  const replaced = new Set(contained);
  result = result.filter((b) => !replaced.has(b));
  const supportConstraint = { x: inner.x, y: inner.y, w: inner.w, h: inner.h };
  result.push({
    ...label,
    shape: 'text',
    kind: 'framed-label',
    roleEvidence: 'text-framed-label',
    componentCount: m.glyphs,
    typeMetrics: m,
    textConfidence: true,
    supportConstraint,
  });
  result.push({
    ...tail,
    shape: 'icon',
    kind: 'control-caret',
    roleEvidence: 'framed-caret',
    sourceBounds: { x: tail.x, y: tail.y, w: tail.w, h: tail.h },
    surfaceBounds: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
    compact: true,
    iconSize: Math.max(4, 2 * Math.round(caret.w * 0.4)),
  });
  return result;
}

function resolveFramedLabelRegion(image, result, contained, inner, measure) {
  const metrics = measure(image, inner);
  if (
    metrics &&
    metrics.glyphs >= 3 &&
    metrics.foregroundCoverage >= 0.9 &&
    metrics.baselineAgreement >= 0.7 &&
    metrics.heightAgreement >= 0.7 &&
    metrics.stroke / metrics.xHeight <= 0.4
  ) {
    const g = metrics.glyphBounds,
      x = Math.max(inner.x, g.x - 1),
      y = Math.max(inner.y, g.y - 1),
      right = Math.min(inner.x + inner.w, g.x + g.w + 1),
      bottom = Math.min(inner.y + inner.h, g.y + g.h + 1);
    const replaced = new Set(contained);
    result = result.filter((b) => !replaced.has(b));
    result.push({
      x,
      y,
      w: right - x,
      h: bottom - y,
      bg: inner.bg,
      shape: 'text',
      kind: 'framed-label',
      componentCount: metrics.glyphs,
      typeMetrics: metrics,
      eraseFragments: [{ ...inner, shape: 'text' }],
    });
  } else if (
    !contained.some((b) => {
      const m = b.shape === 'text' && measure(image, b);
      return m && m.glyphs >= 3 && m.baselineAgreement >= 0.7 && m.heightAgreement >= 0.7;
    })
  ) {
    const replaced = new Set(contained);
    result = result.filter((b) => !replaced.has(b));
    result.push({
      ...inner,
      sourceBounds: { x: inner.x, y: inner.y, w: inner.w, h: inner.h },
      shape: 'unknown',
      kind: 'unresolved-control-label',
      roleEvidence: 'unresolved-control-label',
      contrast: 100,
    });
  }
  return result;
}

function frameTopEdgeExtent(get, width, b, sx, top, color) {
  let left = sx,
    right = sx;
  while (left > 1 && distance(get(left - 1, top), color) < 18) left--;
  while (right < width - 2 && distance(get(right + 1, top), color) < 18) right++;
  const overlap = Math.max(0, Math.min(right + 1, b.x + b.w) - Math.max(left, b.x));
  if (
    right - left < 26 ||
    right - left > 620 ||
    overlap < b.w * 0.7 ||
    left > b.x + (b.shape === 'text' ? 2 : 4) ||
    b.x + b.w - right > Math.max(2, b.h * 0.7)
  )
    return null;
  return { left, right };
}
