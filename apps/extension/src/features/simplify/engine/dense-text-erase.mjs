import { orderStatistic } from './order-statistic.mjs';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function denseTextErase(image, box, bounds, plane) {
  const pixels = image.data,
    w = bounds.w,
    h = bounds.h,
    size = w * h;
  const samples = sampleDenseText(image, box, bounds, plane);
  const { offsets, slots, inside, red, green, blue, delta, count } = samples;
  const distances = delta.slice(0, count),
    peak = orderStatistic(distances, Math.floor((count - 1) * 0.95)) || 0,
    bins = new Map();
  for (let q = 0; q < count; q++)
    if (delta[q] >= Math.max(12, peak * 0.55)) {
      const i = offsets[q],
        r = pixels[i],
        g = pixels[i + 1],
        b = pixels[i + 2],
        key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4),
        bin = bins.get(key) || { count: 0, color: [0, 0, 0] };
      bin.count++;
      bin.color[0] += r;
      bin.color[1] += g;
      bin.color[2] += b;
      bins.set(key, bin);
    }
  const palette = textErasePalette(bins);
  const core = new Uint8Array(size),
    mask = new Uint8Array(size);
  seedDenseTextCore(pixels, count, inside, delta, offsets, red, green, blue, slots, palette, core);
  expandDenseTextSupport(count, delta, slots, w, h, core, mask);
  completeDenseTextFringe(pixels, box, count, inside, delta, slots, offsets, peak, w, size, mask);
  completeWeakTextFringe(box, bounds, plane, samples, mask);
  const runs = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w;) {
      if (!mask[y * w + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < w && mask[y * w + x]) x++;
      runs.push([bounds.y + y, bounds.x + start, x - start]);
    }
  return { ...box, eraseRuns: runs, erasePlane: plane };
}

const WEAK_NEIGHBORS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function collectSourceComponent(seed, foreground, mask, width, queue) {
  const height = foreground.length / width;
  let head = 0,
    count = 1,
    left = width,
    top = height,
    right = -1,
    bottom = -1,
    anchored = false;
  queue[0] = seed;
  foreground[seed] = 0;
  while (head < count) {
    const slot = queue[head++],
      x = slot % width,
      y = Math.floor(slot / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    for (const [dx, dy] of WEAK_NEIGHBORS) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const neighbor = yy * width + xx;
      if (mask[neighbor]) anchored = true;
      if (foreground[neighbor]) {
        foreground[neighbor] = 0;
        queue[count++] = neighbor;
      }
    }
  }
  return { count, left, top, right, bottom, anchored };
}

function belongsToSourceGlyph(component, box, bounds) {
  const { left, top, right, bottom, anchored } = component;
  if (!anchored || left === 0 || top === 0 || right === bounds.w - 1 || bottom === bounds.h - 1)
    return false;
  const x = bounds.x + left,
    y = bounds.y + top;
  if (
    x < box.x ||
    y < box.y ||
    bounds.x + right >= box.x + box.w ||
    bounds.y + bottom >= box.y + box.h
  )
    return false;
  // A whole weak component must belong to one source glyph; a crossing line is not its fringe.
  const owners = box.atoms.filter(
    (atom) =>
      x >= atom.x - 1 &&
      y >= atom.y - 1 &&
      bounds.x + right < atom.x + atom.w + 1 &&
      bounds.y + bottom < atom.y + atom.h + 1
  );
  return owners.length === 1;
}

function completeWeakTextFringe(box, bounds, plane, samples, mask) {
  if (
    !box.atoms?.length ||
    plane.corners[0][3] !== 255 ||
    plane.corners.some((corner) =>
      corner.some((value, channel) => value !== plane.corners[0][channel])
    )
  )
    return;
  const weak = new Uint8Array(mask.length);
  const foreground = new Uint8Array(mask.length);
  for (let index = 0; index < samples.count; index++) {
    const slot = samples.slots[index];
    const difference = Math.round(samples.delta[index]);
    if (difference > 0) foreground[slot] = 1;
    if (!mask[slot] && difference > 0 && difference <= 2) weak[slot] = 1;
  }
  const queue = new Int32Array(mask.length);
  for (let seed = 0; seed < foreground.length; seed++) {
    if (!foreground[seed]) continue;
    // Strong glyph strokes must not split a crossing faint line into apparent fringes.
    const component = collectSourceComponent(seed, foreground, mask, bounds.w, queue);
    if (belongsToSourceGlyph(component, box, bounds))
      for (let index = 0; index < component.count; index++) {
        const slot = queue[index];
        if (weak[slot]) mask[slot] = 1;
      }
  }
}

function sampleDenseText(image, box, bounds, plane) {
  const pixels = image.data,
    stride = image.width,
    w = bounds.w,
    h = bounds.h,
    size = w * h;
  const offsets = new Float64Array(size),
    slots = new Float64Array(size),
    inside = new Uint8Array(size);
  const red = new Float64Array(size),
    green = new Float64Array(size),
    blue = new Float64Array(size),
    delta = new Float64Array(size);
  const top = Array.from({ length: 3 }, () => new Float64Array(w)),
    bottom = Array.from({ length: 3 }, () => new Float64Array(w));
  for (let x = 0; x < w; x++) {
    const u = clamp((bounds.x + x - plane.x) / Math.max(1, plane.w - 1), 0, 1);
    for (let c = 0; c < 3; c++) {
      top[c][x] = plane.corners[0][c] * (1 - u) + plane.corners[1][c] * u;
      bottom[c][x] = plane.corners[2][c] * (1 - u) + plane.corners[3][c] * u;
    }
  }
  let count = 0;
  for (let y = 0; y < h; y++) {
    const yy = bounds.y + y,
      v = clamp((yy - plane.y) / Math.max(1, plane.h - 1), 0, 1);
    for (let x = 0; x < w; x++) {
      const xx = bounds.x + x,
        i = (yy * stride + xx) * 4;
      if (pixels[i + 3] < 128) continue;
      offsets[count] = i;
      slots[count] = y * w + x;
      inside[count] = xx >= box.x && xx < box.x + box.w && yy >= box.y && yy < box.y + box.h;
      // Preserve planeAt's grouping and Float64 values exactly.
      red[count] = top[0][x] * (1 - v) + bottom[0][x] * v;
      green[count] = top[1][x] * (1 - v) + bottom[1][x] * v;
      blue[count] = top[2][x] * (1 - v) + bottom[2][x] * v;
      delta[count] = Math.max(
        Math.abs(pixels[i] - red[count]),
        Math.abs(pixels[i + 1] - green[count]),
        Math.abs(pixels[i + 2] - blue[count])
      );
      count++;
    }
  }
  return { offsets, slots, inside, red, green, blue, delta, count };
}

function seedDenseTextCore(
  pixels,
  count,
  inside,
  delta,
  offsets,
  red,
  green,
  blue,
  slots,
  palette,
  core
) {
  for (let q = 0; q < count; q++) {
    if (!inside[q] || delta[q] < 6) continue;
    const i = offsets[q];
    for (const color of palette) {
      const d0 = color[0] - red[q],
        d1 = color[1] - green[q],
        d2 = color[2] - blue[q],
        length = d0 * d0 + d1 * d1 + d2 * d2;
      if (length < 36) continue;
      const r = pixels[i] - red[q],
        g = pixels[i + 1] - green[q],
        b = pixels[i + 2] - blue[q],
        alpha = (r * d0 + g * d1 + b * d2) / length;
      if (
        alpha >= 0.25 &&
        alpha <= 1.25 &&
        Math.max(Math.abs(r - alpha * d0), Math.abs(g - alpha * d1), Math.abs(b - alpha * d2)) <= 12
      ) {
        core[slots[q]] = 1;
        break;
      }
    }
  }
}

function expandDenseTextSupport(count, delta, slots, w, h, core, mask) {
  for (let q = 0; q < count; q++) {
    if (delta[q] <= 2) continue;
    const k = slots[q],
      x = k % w,
      y = Math.floor(k / w);
    for (let dy = -1; dy <= 1 && !mask[k]; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && core[yy * w + xx]) {
          mask[k] = 1;
          break;
        }
      }
  }
}

function completeDenseTextFringe(
  pixels,
  box,
  count,
  inside,
  delta,
  slots,
  offsets,
  peak,
  w,
  size,
  mask
) {
  for (let q = 0; q < count; q++) if (inside[q] && delta[q] > 8) mask[slots[q]] = 1;
  const fringe = new Uint8Array(mask);
  for (let q = 0; q < count; q++) {
    const k = slots[q],
      i = offsets[q];
    if (
      mask[k] ||
      Math.max(
        Math.abs(pixels[i] - box.bg[0]),
        Math.abs(pixels[i + 1] - box.bg[1]),
        Math.abs(pixels[i + 2] - box.bg[2])
      ) < Math.max(24, peak * 0.12)
    )
      continue;
    const x = k % w;
    if (
      (x > 0 && mask[k - 1]) ||
      (x + 1 < w && mask[k + 1]) ||
      (k >= w && mask[k - w]) ||
      (k + w < size && mask[k + w])
    )
      fringe[k] = 1;
  }
  mask.set(fringe);
}

/** Return the six most populated text-ink bins as mean RGB colors. */
export function textErasePalette(bins) {
  return [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((b) => b.color.map((v) => v / b.count));
}
