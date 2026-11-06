import { bounds, intersect } from './compact-contours.mjs';

function componentForeground(image, box, points) {
  const colors = points.map((p) => {
    const i = ((box.y + Math.floor(p / box.w)) * image.width + box.x + (p % box.w)) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  });
  const low = [...box.bg],
    high = [...box.bg];
  for (const rgb of colors)
    for (let c = 0; c < 3; c++) {
      low[c] = Math.min(low[c], rgb[c]);
      high[c] = Math.max(high[c], rgb[c]);
    }
  if (low.some((v, c) => v < box.bg[c] && high[c] > box.bg[c])) return null;
  const endpoint = low.map((v, c) => (high[c] > box.bg[c] ? high[c] : v));
  // Use an observed ink endpoint, never a fabricated combination of channel maxima.
  return colors.some((rgb) => rgb.every((v, c) => v === endpoint[c])) ? endpoint : null;
}

function sharedTextInteriors(image, box, components, ink) {
  let support = 0;
  for (const { q, top, bottom, left, right } of components) {
    if (
      bottom - top + 1 < box.typeMetrics.xHeight * 0.7 ||
      right - left + 1 > box.typeMetrics.xHeight * 2.5
    )
      continue;
    if (uniformTextInterior(image, box, q, ink, top, bottom) && ++support >= 2) return true;
  }
  return false;
}

function variedColorRows(image, box, points, width, top, bottom) {
  let variedRows = 0;
  for (let y = top; y <= bottom; y++) {
    const vectors = points
      .filter((p) => Math.floor(p / width) === y)
      .map((p) => {
        const i = ((box.y + y) * image.width + box.x + (p % width)) * 4;
        const vector = box.bg.map((v, c) => image.data[i + c] - v);
        const length = Math.hypot(...vector) || 1;
        return vector.map((v) => v / length);
      });
    let different = 0;
    for (let i = 0; i < vectors.length; i++)
      for (let j = i + 1; j < vectors.length; j++)
        if (Math.hypot(...vectors[i].map((v, c) => v - vectors[j][c])) > 0.08) different++;
    if (different >= Math.max(3, vectors.length)) variedRows++;
  }
  return variedRows;
}

export function uncertainColorTexture(image, box) {
  const unit = box.typeMetrics?.xHeight;
  if (box.shape !== 'text' || !unit || box.w < unit * 8 || box.h > unit * 4) return false;
  const w = box.w,
    h = box.h,
    mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((box.y + y) * image.width + box.x + x) * 4,
        rgb = [image.data[i], image.data[i + 1], image.data[i + 2]];
      if (
        image.data[i + 3] >= 128 &&
        Math.max(...rgb) > 105 &&
        Math.max(...rgb) - Math.min(...rgb) > 65 &&
        Math.max(...rgb.map((v, c) => Math.abs(v - box.bg[c]))) > 100 &&
        rgb[0] + rgb[1] + rgb[2] > box.bg[0] + box.bg[1] + box.bg[2] + 120
      )
        mask[y * w + x] = 1;
    }
  const components = [];
  for (let k = 0; k < mask.length; k++)
    if (mask[k]) components.push(textureComponent(mask, w, h, k));
  const sharedInks = new Map();
  for (const { q, left, right, top, bottom } of components) {
    const cw = right - left + 1,
      ch = bottom - top + 1;
    if (
      cw < unit * 0.8 ||
      ch < unit * 0.7 ||
      cw > unit * 2.5 ||
      ch > unit * 2.5 ||
      q.length / (cw * ch) < 0.55
    )
      continue;
    if (variedColorRows(image, box, q, w, top, bottom) < 2) continue;
    // Thin subpixel strokes can lack an eroded core. They need the same observed
    // ink in two independent uniform interiors before they can borrow that evidence.
    const ink = componentForeground(image, box, q);
    if (uniformTextInterior(image, box, q, ink, top, bottom)) continue;
    if (ink && uniformTextInterior(image, box, q, ink, top, bottom, true)) {
      const key = ink.join(',');
      if (!sharedInks.has(key))
        sharedInks.set(key, sharedTextInteriors(image, box, components, ink));
      if (sharedInks.get(key)) continue;
    }
    return true;
  }
  return false;
}

export function iconRowDots(image, box, input, protectedRects) {
  if (box.shape !== 'text' || box.w > 60 || box.h > 24) return null;
  const parts = dotRowParts(image, box);
  if (parts.length !== 3) return null;
  const side = parts.reduce((n, p) => n + (p.w + p.h) / 2, 0) / 3,
    tol = Math.max(1, side * 0.3);
  if (
    side < 3 ||
    parts.some(
      (p) =>
        Math.abs(p.w - side) > tol ||
        Math.abs(p.h - side) > tol ||
        Math.abs(p.y - parts[0].y) > tol ||
        p.n / (p.w * p.h) < 0.4
    )
  )
    return null;
  const gaps = [parts[1].x - parts[0].x - parts[0].w, parts[2].x - parts[1].x - parts[1].w];
  if (gaps.some((g) => g < 1 || g > side) || Math.abs(gaps[0] - gaps[1]) > tol) return null;
  const tight = bounds(parts),
    cy = tight.y + tight.h / 2,
    cx = tight.x + tight.w / 2;
  if (protectedRects.some((p) => intersect(tight, p))) return null;
  const icons = input
    .filter(
      (p) =>
        p !== box &&
        p.shape === 'icon' &&
        Math.abs(p.y + p.h / 2 - cy) <= Math.max(2, p.h * 0.2) &&
        p.w >= tight.w * 0.6 &&
        p.w <= tight.w * 2 &&
        p.h >= tight.h * 1.5 &&
        p.h <= tight.w * 2
    )
    .sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
  for (let i = 0; i < icons.length; i++)
    for (let j = i + 1; j < icons.length; j++) {
      const centers = [cx, icons[i].x + icons[i].w / 2, icons[j].x + icons[j].w / 2].sort(
          (a, b) => a - b
        ),
        a = centers[1] - centers[0],
        b = centers[2] - centers[1];
      if (a < tight.w * 1.1 || a > tight.w * 3 || Math.abs(a - b) > Math.max(2, a * 0.15)) continue;
      return {
        ...box,
        shape: 'icon',
        kind: 'compact-graphic',
        compact: true,
        roleEvidence: 'icon-row-dots',
        iconSize: Math.min(tight.w, tight.h),
        sourceBounds: { ...box },
      };
    }
  return null;
}

export function staggeredColor(image, box) {
  const atoms = box.atoms || [];
  const colored = atoms
    .filter(
      (p) =>
        p.w >= 4 && p.h >= 4 && p.n >= 16 && p.rgb && Math.max(...p.rgb) - Math.min(...p.rgb) >= 48
    )
    .sort((a, b) => a.x - b.x);
  if (colored.length !== 2) return null;
  const [a, b] = colored,
    unit = Math.min(a.h, b.h),
    gap = b.x - a.x - a.w;
  if (
    gap < -1 ||
    gap > unit * 0.65 ||
    Math.abs(a.y + a.h - b.y - b.h) < unit * 0.5 ||
    Math.max(...a.rgb.map((v, c) => Math.abs(v - b.rgb[c]))) < 24
  )
    return null;
  const remainder = atoms.filter((p) => !colored.includes(p));
  if (
    remainder.some(
      (p) =>
        !p.rgb ||
        p.w > 2 ||
        p.h < box.h * 0.8 ||
        Math.max(...p.rgb) - Math.min(...p.rgb) >= 24 ||
        !(p.x <= box.x + 2 || p.x + p.w >= box.x + box.w - 2)
    )
  )
    return null;
  const tight = bounds(colored),
    runs = [];
  // Keep neutral divider pixels outside the source ownership and replacement bounds.
  for (let y = tight.y; y < tight.y + tight.h; y++)
    for (let x = tight.x; x < tight.x + tight.w;) {
      const owned = (xx) => {
        if (!colored.some((p) => xx >= p.x && xx < p.x + p.w && y >= p.y && y < p.y + p.h))
          return false;
        const i = (y * image.width + xx) * 4,
          rgb = [image.data[i], image.data[i + 1], image.data[i + 2]];
        return (
          image.data[i + 3] >= 128 &&
          Math.max(...rgb) - Math.min(...rgb) >= 12 &&
          Math.max(...box.bg.map((v, c) => Math.abs(v - rgb[c]))) > 8
        );
      };
      if (!owned(x)) {
        x++;
        continue;
      }
      const start = x;
      while (x < tight.x + tight.w && owned(x)) x++;
      runs.push([y, start, x - start]);
    }
  return runs.length ? { parts: colored, tight, runs } : null;
}

// Diagonal antialiasing can join two independently shaped marks at one corner.
// Four-neighbour connectivity preserves that distinction without changing pixels.
function orthogonalParts(image, box) {
  const w = box.w,
    h = box.h,
    mask = new Uint8Array(w * h),
    parts = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((box.y + y) * image.width + box.x + x) * 4;
      mask[y * w + x] =
        image.data[i + 3] >= 128 &&
        Math.max(...box.bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 40
          ? 1
          : 0;
    }
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const q = [i];
    mask[i] = 0;
    let left = w,
      right = 0,
      top = h,
      bottom = 0;
    for (let n = 0; n < q.length; n++) {
      const p = q[n],
        x = p % w,
        y = Math.floor(p / w);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        const xx = x + dx,
          yy = y + dy,
          j = yy * w + xx;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h && mask[j]) {
          mask[j] = 0;
          q.push(j);
        }
      }
    }
    if (q.length >= 3)
      parts.push({
        x: box.x + left,
        y: box.y + top,
        w: right - left + 1,
        h: bottom - top + 1,
        n: q.length,
      });
  }
  return parts;
}
export function joinedStaggeredPrefix(image, box, input, measure, protectedRects) {
  if (
    box.shape !== 'text' ||
    !box.textConfidence ||
    box.w > box.h * 1.5 ||
    box.w < 7 ||
    box.h < 7 ||
    box.w > 40 ||
    box.h > 40
  )
    return null;
  const parts = orthogonalParts(image, box).sort((a, b) => b.n - a.n);
  if (parts.length !== 2) return null;
  const [a, b] = parts,
    small = Math.min(a.h, b.h),
    large = Math.max(a.h, b.h),
    tight = bounds(parts);
  if (!staggeredPairGeometry(a, b, tight)) return null;
  if (
    protectedRects.some((p) => intersect(tight, p)) ||
    input.some((p) => p !== box && intersect(tight, p))
  )
    return null;
  const label = input.find(
    (p) =>
      p !== box &&
      p.shape === 'text' &&
      p.textConfidence &&
      p.x >= tight.x + tight.w &&
      p.x - (tight.x + tight.w) <= small * 1.5 &&
      Math.abs(p.y + p.h / 2 - (tight.y + tight.h / 2)) <= small * 0.6
  );
  if (!label) return null;
  const m = measure(image, label);
  if (
    !m ||
    m.glyphs < 3 ||
    m.baselineAgreement < 0.7 ||
    m.heightAgreement < 0.7 ||
    small < m.xHeight * 0.8 ||
    large > m.xHeight * 1.8
  )
    return null;
  const sourceBounds = {
    x: Math.max(box.x, tight.x - 1),
    y: Math.max(box.y, tight.y - 1),
    w: tight.w + 2,
    h: tight.h + 2,
  };
  return {
    ...sourceBounds,
    bg: box.bg,
    contrast: box.contrast,
    shape: 'icon',
    kind: 'compact-graphic',
    compact: true,
    roleEvidence: 'staggered-pair',
    iconSize: Math.min(tight.w, tight.h),
    sourceBounds,
  };
}

function textureComponent(mask, w, h, k) {
  const q = [k];
  mask[k] = 0;
  let left = w,
    right = 0,
    top = h,
    bottom = 0;
  for (let n = 0; n < q.length; n++) {
    const p = q[n],
      x = p % w,
      y = Math.floor(p / w);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const xx = x + dx,
        yy = y + dy,
        j = yy * w + xx;
      if (xx >= 0 && xx < w && yy >= 0 && yy < h && mask[j]) {
        mask[j] = 0;
        q.push(j);
      }
    }
  }
  return { q, left, right, top, bottom };
}

function uniformTextInterior(image, box, q, dominant, top, bottom, shared = false) {
  const w = box.w;
  const rgbAt = (p) => {
    const i = ((box.y + Math.floor(p / w)) * image.width + box.x + (p % w)) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  };
  const containsDominant = dominant && q.some((p) => rgbAt(p).every((v, c) => v === dominant[c]));
  const insideEnvelope =
    dominant &&
    q.every((p) =>
      rgbAt(p).every(
        (v, c) =>
          v >= Math.min(box.bg[c], dominant[c]) - 1 && v <= Math.max(box.bg[c], dominant[c]) + 1
      )
    );
  if (containsDominant && insideEnvelope) {
    const component = new Set(q);
    const core = q.filter(
      (p) =>
        p % w > 0 &&
        p % w < w - 1 &&
        component.has(p - 1) &&
        component.has(p + 1) &&
        component.has(p - w) &&
        component.has(p + w)
    );
    if (core.length ? variedColorRows(image, box, core, w, top, bottom) === 0 : shared) return true;
  }
  return false;
}

function dotRowParts(image, box) {
  const columns = [];
  for (let x = box.x; x < box.x + box.w; x++) {
    let top = Infinity,
      bottom = -1,
      n = 0;
    for (let y = box.y; y < box.y + box.h; y++) {
      const i = (y * image.width + x) * 4;
      if (
        image.data[i + 3] >= 128 &&
        Math.max(...box.bg.map((v, c) => Math.abs(v - image.data[i + c]))) > 100
      ) {
        top = Math.min(top, y);
        bottom = y;
        n++;
      }
    }
    columns.push({ x, top, bottom, n });
  }
  const parts = [];
  for (let i = 0; i < columns.length;) {
    if (!columns[i].n) {
      i++;
      continue;
    }
    const start = i;
    while (i < columns.length && columns[i].n) i++;
    const group = columns.slice(start, i);
    parts.push({
      x: group[0].x,
      y: Math.min(...group.map((c) => c.top)),
      w: group.length,
      h: Math.max(...group.map((c) => c.bottom)) - Math.min(...group.map((c) => c.top)) + 1,
      n: group.reduce((n, c) => n + c.n, 0),
    });
  }
  return parts;
}

function staggeredPairGeometry(a, b, tight) {
  const small = Math.min(a.h, b.h),
    large = Math.max(a.h, b.h);
  const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if (
    small < 7 ||
    small / large < 0.7 ||
    Math.min(a.w, b.w) < small * 0.55 ||
    Math.max(a.w, b.w) > large * 1.4 ||
    overlap < 1 ||
    overlap > Math.min(a.w, b.w) * 0.55 ||
    Math.abs(a.y - b.y) < small * 0.45 ||
    Math.abs(a.y + a.h - b.y - b.h) < small * 0.35 ||
    tight.w / tight.h < 0.7 ||
    tight.w / tight.h > 1.4
  )
    return false;
  return true;
}
