import { intersects, contains } from './structure-topology.mjs';

export function inkRuns(image, bounds, bg, seed = null) {
  const left = Math.max(0, Math.floor(bounds.x)),
    top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(image.width, Math.ceil(bounds.x + bounds.w)),
    bottom = Math.min(image.height, Math.ceil(bounds.y + bounds.h));
  const width = right - left,
    height = bottom - top,
    mask = new Uint8Array(width * height);
  const distance = (x, y) => {
    const i = (y * image.width + x) * 4;
    return Math.max(...bg.map((v, c) => Math.abs(v - image.data[i + c])));
  };
  if (seed) {
    const sx = Math.round(seed.x),
      sy = Math.round(seed.y),
      i = (sy * image.width + sx) * 4;
    const direction = bg.map((v, c) => v - image.data[i + c]),
      length = Math.hypot(...direction);
    const eligible = (x, y) => {
      const at = (y * image.width + x) * 4;
      if (image.data[at + 3] === 0 || distance(x, y) <= 12) return false;
      const p = (y * image.width + x) * 4,
        d = bg.map((v, c) => v - image.data[p + c]),
        size = Math.hypot(...d);
      const projection = d.reduce((n, v, c) => n + v * direction[c], 0) / (length * length);
      return (
        size &&
        projection > 0 &&
        d.reduce((n, v, c) => n + v * direction[c], 0) / (size * length) >= 0.85 &&
        Math.max(...d.map((v, c) => Math.abs(v - projection * direction[c]))) <= 12
      );
    };
    if (sx < left || sx >= right || sy < top || sy >= bottom) return [];
    fillSeededInk(mask, width, height, left, top, sx, sy, eligible);
    attachSeededInkFringe(image, bg, mask, width, height, left, top, direction, length, distance);
  } else {
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++)
        if (image.data[(y * image.width + x) * 4 + 3] > 0 && distance(x, y) > 2)
          mask[(y - top) * width + x - left] = 1;
  }
  const runs = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width;) {
      if (!mask[y * width + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && mask[y * width + x]) x++;
      runs.push([top + y, left + start, x - start]);
    }
  return runs;
}

export function runBounds(runs) {
  const x = Math.min(...runs.map((r) => r[1])),
    y = runs[0][0];
  return { x, y, w: Math.max(...runs.map((r) => r[1] + r[2])) - x, h: runs.at(-1)[0] - y + 1 };
}

export function inkOverlap(image, box, runs) {
  const b = box.sourceBounds || box;
  if (!intersects(b, runBounds(runs))) return 0;
  const rows = new Map();
  for (const r of runs) {
    const list = rows.get(r[0]) || [];
    list.push(r);
    rows.set(r[0], list);
  }
  let own = 0,
    total = 0;
  for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(image.height, b.y + b.h); y++)
    for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(image.width, b.x + b.w); x++) {
      const i = (y * image.width + x) * 4;
      if (Math.max(...box.bg.map((v, c) => Math.abs(v - image.data[i + c]))) <= 40) continue;
      total++;
      if ((rows.get(y) || []).some((r) => x >= r[1] && x < r[1] + r[2])) own++;
    }
  return own / Math.max(1, total);
}

function graphicOwner(bounds, bg, runs, reason) {
  return {
    ...bounds,
    shape: 'graphic',
    kind: reason,
    roleEvidence: reason,
    bg,
    contrast: 255,
    sourceBounds: { ...bounds },
    sourceRuns: runs,
    paintBounds: { ...bounds },
  };
}

function hasChromaticInk(image, box) {
  let n = 0;
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(image.height, box.y + box.h); y++)
    for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(image.width, box.x + box.w); x++) {
      const i = (y * image.width + x) * 4;
      const c = [image.data[i], image.data[i + 1], image.data[i + 2]];
      if (
        Math.max(...c) - Math.min(...c) >= 60 &&
        Math.max(...c.map((v, k) => Math.abs(v - box.bg[k]))) >= 40
      )
        n++;
    }
  return n >= 12;
}

export function mergeRuns(input) {
  const sorted = input.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    result = [];
  for (const run of sorted) {
    const last = result.at(-1);
    if (last && last[0] === run[0] && run[1] <= last[1] + last[2])
      last[2] = Math.max(last[1] + last[2], run[1] + run[2]) - last[1];
    else result.push([...run]);
  }
  return result;
}

function fillSeededInk(mask, width, height, left, top, sx, sy, eligible) {
  const queue = [(sy - top) * width + sx - left];
  mask[queue[0]] = 1;
  for (let n = 0; n < queue.length; n++) {
    const x = queue[n] % width,
      y = Math.floor(queue[n] / width);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx,
          yy = y + dy,
          k = yy * width + xx;
        if (
          xx < 0 ||
          yy < 0 ||
          xx >= width ||
          yy >= height ||
          mask[k] ||
          !eligible(left + xx, top + yy)
        )
          continue;
        mask[k] = 1;
        queue.push(k);
      }
  }
}

function attachSeededInkFringe(
  image,
  bg,
  mask,
  width,
  height,
  left,
  top,
  direction,
  length,
  distance
) {
  const core = new Uint8Array(mask);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (core[y * width + x] || distance(left + x, top + y) <= 2) continue;
      const at = ((top + y) * image.width + left + x) * 4;
      if (image.data[at + 3] === 0) continue;
      const d = bg.map((v, c) => v - image.data[at + c]),
        size = Math.hypot(...d);
      if (!size || d.reduce((n, v, c) => n + v * direction[c], 0) / (size * length) < 0.9) continue;
      if (adjacentCoreInk(core, width, height, x, y)) mask[y * width + x] = 1;
    }
}

function adjacentCoreInk(core, width, height, x, y) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx,
        yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < width && yy < height && core[yy * width + xx]) return true;
    }
  return false;
}

export function resolveAtomCaptionConflicts(input, boxes, owners, absorbed) {
  for (const label of input) {
    const m = label.typeMetrics;
    if (
      label.shape !== 'text' ||
      !m ||
      m.glyphs < 3 ||
      m.baselineAgreement < 0.8 ||
      m.heightAgreement < 0.8 ||
      m.stroke / m.xHeight > 0.4
    )
      continue;
    for (const other of input) {
      if (other.shape !== 'unknown' || !other.atoms) continue;
      const rightGap = other.x - (label.x + label.w),
        leftGap = label.x - (other.x + other.w);
      if (!((rightGap >= -3 && rightGap <= 2) || (leftGap >= -3 && leftGap <= 2))) continue;
      const aligned = other.atoms.filter(
        (a) =>
          a.h >= m.xHeight * 0.7 &&
          a.h <= m.xHeight * 1.8 &&
          Math.abs(a.y + a.h - (m.glyphBounds.y + m.glyphBounds.h)) <= m.xHeight * 0.6
      );
      const extension = other.atoms.some(
        (a) =>
          a.w >= m.xHeight &&
          a.h >= m.xHeight * 2 &&
          a.y <= m.glyphBounds.y + m.glyphBounds.h &&
          a.y + a.h >= m.glyphBounds.y + m.glyphBounds.h + m.xHeight
      );
      if (aligned.length < 2 || !extension) continue;
      const x = Math.min(label.x, other.x),
        y = Math.min(label.y, other.y),
        right = Math.max(label.x + label.w, other.x + other.w),
        bottom = Math.max(label.y + label.h, other.y + other.h);
      const parent = {
        x,
        y,
        w: right - x,
        h: bottom - y,
        bg: label.bg,
        shape: 'unknown',
        kind: 'overlaid-caption-conflict',
        roleEvidence: 'overlaid-caption-conflict',
      };
      boxes = boxes.filter((b) => !contains(parent, b, 1));
      owners.push(parent);
      absorbed.add(label);
      absorbed.add(other);
      break;
    }
  }
  return boxes;
}

export function resolveConnectedCaptionClaims(
  image,
  input,
  boxes,
  measure,
  background,
  owners,
  absorbed
) {
  for (const claim of input) {
    if (claim.shape !== 'text' || absorbed.has(claim)) continue;
    const metrics = claim.typeMetrics || measure(image, claim);
    if (!metrics?.unexplained?.length) continue;
    for (const part of metrics.unexplained) {
      const margin = Math.max(4, Math.ceil(part.h * 0.12));
      const search = {
        x: part.x - margin,
        y: part.y - margin,
        w: part.w + margin * 2,
        h: part.h + margin * 2,
      };
      const runs = inkRuns(image, search, claim.bg, { x: part.seedX, y: part.seedY });
      if (!runs.length) continue;
      const bounds = runBounds(runs);
      if (owners.some((o) => contains(o, bounds, 2))) continue;
      const owner = graphicOwner(bounds, claim.bg, runs, 'connected-graphic');
      const glyph = metrics.glyphBounds,
        pad = 1;
      const overlap = inkOverlap(image, { ...glyph, bg: claim.bg }, runs);
      const conflict =
        metrics.glyphs >= 3 &&
        metrics.baselineAgreement >= 0.8 &&
        metrics.heightAgreement >= 0.8 &&
        metrics.stroke / metrics.xHeight <= 0.4 &&
        overlap >= 0.25 &&
        bounds.y <= glyph.y + glyph.h * 0.5 &&
        bounds.y + bounds.h >= glyph.y + glyph.h + metrics.xHeight;
      if (conflict) {
        boxes = removeConnectedCaptionClaims(image, boxes, claim, runs);
        owners.push(overlaidCaptionOwner(claim, bounds));
        continue;
      }
      if (metrics.foregroundCoverage >= 0.5) continue;
      const label = separateCaptionLabel(image, metrics, glyph, pad, background, measure);
      if (label.typeMetrics && label.typeMetrics.glyphs >= 2) {
        boxes.push(label);
        if (intersects(owner.paintBounds, label) && label.y > owner.y + owner.h * 0.6)
          owner.paintBounds = { ...owner.paintBounds, h: Math.max(1, label.y - owner.y - 1) };
      }
      boxes = removeConnectedCaptionClaims(image, boxes, claim, runs);
      owners.push(owner);
    }
  }
  return boxes;
}

export function resolveDecorativeLockups(image, boxes, background) {
  const ordinary = boxes
    .filter((b) => b.shape === 'text' && b.typeMetrics)
    .map((b) => b.typeMetrics.xHeight)
    .sort((a, b) => a - b);
  const typical = ordinary[Math.floor(ordinary.length / 2)] || 0;
  const grouped = new Set(),
    lockups = [];
  for (const b of boxes) {
    const m = b.typeMetrics;
    if (
      b.shape !== 'text' ||
      !m ||
      m.glyphs > 8 ||
      m.xHeight < typical * 1.35 ||
      m.stroke / m.xHeight < 0.23
    )
      continue;
    const ornament = boxes.find(
      (q) =>
        q !== b &&
        !grouped.has(q) &&
        ['unknown', 'icon'].includes(q.shape) &&
        q.x >= b.x + b.w * 0.7 &&
        q.x <= b.x + b.w + b.h * 0.5 &&
        q.y + q.h / 2 < b.y + b.h * 0.5 &&
        q.y + q.h > b.y - 2 &&
        q.w >= 8 &&
        q.h >= 8 &&
        hasChromaticInk(image, q)
    );
    if (!ornament) continue;
    const x = Math.min(b.x, ornament.x),
      y = Math.min(b.y, ornament.y),
      right = Math.max(b.x + b.w, ornament.x + ornament.w),
      bottom = Math.max(b.y + b.h, ornament.y + ornament.h);
    const bounds = { x, y, w: right - x, h: bottom - y },
      members = boxes.filter((q) => contains(bounds, q, 2));
    if (members.some((q) => q !== b && q !== ornament && q.shape === 'text')) continue;
    const bg = background(image, bounds),
      runs = inkRuns(image, bounds, bg);
    if (!runs.length) continue;
    lockups.push(graphicOwner(runBounds(runs), bg, runs, 'decorative-lockup'));
    for (const q of members) grouped.add(q);
  }
  return [...boxes.filter((b) => !grouped.has(b)), ...lockups];
}

function removeConnectedCaptionClaims(image, boxes, claim, runs) {
  return boxes.filter(
    (b) =>
      b !== claim &&
      !(
        b.x === claim.x &&
        b.y === claim.y &&
        b.w === claim.w &&
        b.h === claim.h &&
        b.shape === claim.shape
      ) &&
      inkOverlap(image, b, runs) < 0.6
  );
}

function overlaidCaptionOwner(claim, bounds) {
  const x = Math.min(claim.x, bounds.x),
    y = Math.min(claim.y, bounds.y),
    right = Math.max(claim.x + claim.w, bounds.x + bounds.w),
    bottom = Math.max(claim.y + claim.h, bounds.y + bounds.h);
  return {
    x,
    y,
    w: right - x,
    h: bottom - y,
    bg: claim.bg,
    shape: 'unknown',
    kind: 'overlaid-caption-conflict',
    roleEvidence: 'overlaid-caption-conflict',
  };
}

function separateCaptionLabel(image, metrics, glyph, pad, background, measure) {
  const label = {
    x: Math.max(0, glyph.x - pad),
    y: Math.max(0, glyph.y - pad),
    w: glyph.w + pad * 2,
    h: glyph.h + pad * 2,
    shape: 'text',
    kind: 'separate-caption',
    componentCount: metrics.glyphs,
    bg: background(image, glyph),
    contrast: metrics.foregroundContrast,
    textSize: Math.max(4, 2 * Math.round(metrics.xHeight / 2)),
    textConfidence: true,
  };
  label.typeMetrics = measure(image, label);
  return label;
}

export function extendedDescenderRow(image, label, p, m, measure) {
  const x = label.x,
    y = Math.min(label.y, p.y - 1),
    right = Math.max(label.x + label.w, p.x + p.w + 1),
    bottom = Math.max(label.y + label.h, p.y + p.h + 1),
    row = { ...label, x, y, w: right - x, h: bottom - y, kind: 'source-font-row' },
    combined = measure(image, row, 1);
  if (
    !combined ||
    combined.glyphs < m.glyphs + 1 ||
    combined.foregroundCoverage < 0.95 ||
    combined.baselineAgreement < 0.9 ||
    combined.heightAgreement < 0.9
  )
    return null;

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

  row.typeMetrics = combined;
  row.textSize = Math.max(4, 2 * Math.round(combined.xHeight * 0.8));
  row.textCenterY = combined.glyphBounds.y + combined.glyphBounds.h / 2;
  row.contrast = combined.foregroundContrast;
  return row;
}

/** Antialias coverage changes mean ink intensity, but preserves its direction from the surface. */
export function sameSourceInk(a, b, bg, referenceBg = bg) {
  const first = a.map((v, c) => v - bg[c]),
    second = b.map((v, c) => v - referenceBg[c]);
  const firstPeak = Math.max(...first.map(Math.abs)),
    secondPeak = Math.max(...second.map(Math.abs));
  return (
    firstPeak > 0 &&
    secondPeak > 0 &&
    Math.max(...first.map((v, c) => Math.abs(v / firstPeak - second[c] / secondPeak))) <= 0.12
  );
}

/** Compares local source glyph ink without a stored alphabet or recognized character. */
export function matchingSourceGlyph(image, glyph, part, bg, referenceBg = bg) {
  if (!sameSourceInk(glyph.rgb, part.rgb, bg, referenceBg)) return false;
  if (
    Math.min(glyph.w, part.w) < Math.max(glyph.w, part.w) * 0.8 ||
    Math.min(glyph.h, part.h) < Math.max(glyph.h, part.h) * 0.8
  )
    return false;
  const foreground = (x, y, surface) => {
    const i = (y * image.width + x) * 4;
    return image.data[i + 3] >= 128 && surface.some((v, c) => Math.abs(v - image.data[i + c]) > 40);
  };
  let common = 0,
    total = 0;
  for (let y = 0; y < glyph.h; y++)
    for (let x = 0; x < glyph.w; x++) {
      const a = foreground(glyph.x + x, glyph.y + y, bg);
      const b = foreground(
        part.x + Math.min(part.w - 1, Math.floor(((x + 0.5) * part.w) / glyph.w)),
        part.y + Math.min(part.h - 1, Math.floor(((y + 0.5) * part.h) / glyph.h)),
        referenceBg
      );
      if (a || b) total++;
      if (a && b) common++;
    }
  return total > 0 && common / total >= 0.78;
}
