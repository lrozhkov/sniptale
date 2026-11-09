import { traceClearedMediaComponent } from './media-components.mjs';
import { colorDistanceAt } from './control-shapes.mjs';
// Local and compound texture evidence follows the original component membership and sampling grids.

export function detectLocalTexturedObjects(image, queue) {
  const { width, height } = image,
    size = 32,
    columns = Math.ceil(width / size),
    backgrounds = sampleLocalTextureBackgrounds(image, size, columns);
  const mask = createLocalTextureMask(image, backgrounds, size, columns),
    parts = [],
    silhouettes = [];
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const { tail, left, right, top, bottom } = traceClearedMediaComponent(
      mask,
      width,
      height,
      k,
      queue
    );
    const w = right - left + 1,
      h = bottom - top + 1,
      density = tail / (w * h);
    if (w >= 1 && h >= 4 && w <= 110 && h <= 96 && tail >= 5)
      silhouettes.push({ x: left, y: top, w, h });
    if (
      w < 18 ||
      h < 22 ||
      w > 110 ||
      h > 96 ||
      w / h < 0.5 ||
      w / h > 2.5 ||
      density < 0.55 ||
      density > 0.95
    )
      continue;
    parts.push({
      x: left,
      y: top,
      w,
      h,
      ...measureLocalTexture(image, { left, right, top, bottom }),
    });
  }
  return parts
    .filter((p) => p.colors >= 96 && p.hues >= 2 && p.texture >= 0.25)
    .filter(
      (p) =>
        !silhouettes.some(
          (q) =>
            (q.x !== p.x || q.y !== p.y || q.w !== p.w || q.h !== p.h) &&
            q.w >= q.h * 0.2 &&
            q.w <= q.h * 1.5 &&
            Math.min(p.h, q.h) >= Math.max(p.h, q.h) * 0.6 &&
            Math.abs(p.y + p.h - q.y - q.h) <= Math.max(p.h, q.h) * 0.4 &&
            Math.max(q.x - p.x - p.w, p.x - q.x - q.w, 0) <= Math.min(p.h, q.h) * 0.7
        )
    )
    .map((p) => localTextureProposal(image, p));
}

// Compound color counts and support tests depend on membership, not visit order.
function compoundComponent(mask, width, height, seed, queue) {
  const pending = [seed];
  let tail = 0,
    l = width,
    r = 0,
    t = height,
    b = 0;
  while (pending.length) {
    const at = pending.pop();
    if (!mask[at]) continue;
    const y = Math.floor(at / width),
      row = y * width;
    let left = at % width,
      right = left;
    while (left > 0 && mask[row + left - 1]) left--;
    while (right + 1 < width && mask[row + right + 1]) right++;
    l = Math.min(l, left);
    r = Math.max(r, right);
    t = Math.min(t, y);
    b = Math.max(b, y);
    mask.fill(0, row + left, row + right + 1);
    let above = false,
      below = false;
    for (let x = left; x <= right; x++) {
      const p = row + x;
      queue[tail++] = p;
      const up = y > 0 && !!mask[p - width],
        down = y + 1 < height && !!mask[p + width];
      if (up && !above) pending.push(p - width);
      if (down && !below) pending.push(p + width);
      above = up;
      below = down;
    }
  }
  return { tail, l, r, t, b };
}

function rgbBin(data, offset) {
  return ((data[offset] >> 4) << 8) | ((data[offset + 1] >> 4) << 4) | (data[offset + 2] >> 4);
}

export function detectCompound({ data, width, height }, established, queue) {
  const backgrounds = sampleCompoundBackgrounds({ data, width, height });
  const out = [];
  for (const bg of backgrounds) {
    const mask = createCompoundMask({ data, width, height }, bg);
    for (let p = mask.indexOf(1); p !== -1; p = mask.indexOf(1, p + 1)) {
      const { tail, l, r, t, b } = compoundComponent(mask, width, height, p, queue);
      if (l <= 0 || t <= 0 || r >= width - 1 || b >= height - 1 || tail < 100) continue;
      if (!hasCompoundPerimeterSupport({ data, width }, { l, r, t, b }, bg)) continue;
      const clusters = compoundColorClusters({ data, width }, queue, tail);
      if (!hasCompoundColorVariation(clusters, bg)) continue;
      // A disconnected, established object inside the bounding box is evidence that
      // this flood follows its surrounding surface rather than the object itself.
      const disconnected = findDisconnectedCompoundOwners(
        width,
        { l, r, t, b },
        established,
        queue,
        tail
      );
      out.push({
        x: l - 1,
        y: t - 1,
        w: r - l + 3,
        h: b - t + 3,
        kind: 'compound-island',
        shape: 'image',
        bg: bg.map(Math.round),
        contrast: 255,
        _disconnectedOwners: disconnected,
      });
    }
  }
  return out;
}

function sampleLocalTextureBackgrounds(image, size, columns) {
  const { data, width, height } = image,
    backgrounds = [];
  for (let ty = 0; ty < Math.ceil(height / size); ty++)
    for (let tx = 0; tx < columns; tx++) {
      const bins = new Map();
      for (let y = ty * size; y < Math.min(height, (ty + 1) * size); y += 2)
        for (let x = tx * size; x < Math.min(width, (tx + 1) * size); x += 2) {
          const i = (y * width + x) * 4,
            key = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4);
          const bin = bins.get(key) || [0, 0, 0, 0];
          bin[0]++;
          for (let c = 0; c < 3; c++) bin[c + 1] += data[i + c];
          bins.set(key, bin);
        }
      const best = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
      backgrounds.push(best.slice(1).map((value) => value / best[0]));
    }
  return backgrounds;
}

function createLocalTextureMask(image, backgrounds, size, columns) {
  const { data, width, height } = image,
    mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        bg = backgrounds[Math.floor(y / size) * columns + Math.floor(x / size)];
      if (
        data[i + 3] >= 128 &&
        Math.max(
          Math.abs(bg[0] - data[i]),
          Math.abs(bg[1] - data[i + 1]),
          Math.abs(bg[2] - data[i + 2])
        ) > 35
      )
        mask[y * width + x] = 1;
    }
  return mask;
}

function measureLocalTexture(image, bounds) {
  const { data, width } = image;
  const { left, right, top, bottom } = bounds;
  const w = right - left + 1,
    h = bottom - top + 1;
  const colors = new Set(),
    hues = Array(6).fill(0),
    step = Math.max(1, Math.round(Math.min(w, h) / 20));
  let edges = 0,
    samples = 0;
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const i = (y * width + x) * 4,
        r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      colors.add([r >> 4, g >> 4, b >> 4].join(','));
      if (Math.max(r, g, b) - Math.min(r, g, b) >= 48) {
        let hue;
        if (r >= g && r >= b) hue = g >= b ? 0 : 5;
        else if (g >= r && g >= b) hue = r >= b ? 1 : 2;
        else hue = g >= r ? 3 : 4;
        hues[hue]++;
      }
      if (x > left + step && x < right - step && y > top + step && y < bottom - step) {
        const horizontal = i + step * 4,
          vertical = i + width * step * 4;
        if (
          Math.max(...[0, 1, 2].map((c) => Math.abs(data[i + c] - data[horizontal + c]))) > 45 ||
          Math.max(...[0, 1, 2].map((c) => Math.abs(data[i + c] - data[vertical + c]))) > 45
        )
          edges++;
        samples++;
      }
    }
  return {
    colors: colors.size,
    hues: hues.filter((n) => n >= Math.max(5, w * h * 0.04)).length,
    texture: edges / Math.max(1, samples),
  };
}

function localTextureProposal(image, p) {
  const { data, width, height } = image;

  const samples = [];
  for (const [x, y] of [
    [p.x - 2, p.y - 2],
    [p.x + p.w + 1, p.y - 2],
    [p.x - 2, p.y + p.h + 1],
    [p.x + p.w + 1, p.y + p.h + 1],
  ]) {
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = (y * width + x) * 4;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  }
  const bg = [0, 1, 2].map((c) => {
    const values = samples.map((v) => v[c]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 255;
  });
  const x = Math.max(0, p.x - 2),
    y = Math.max(0, p.y - 2);
  return {
    x,
    y,
    w: Math.min(width, p.x + p.w + 2) - x,
    h: Math.min(height, p.y + p.h + 2) - y,
    bg,
    shape: 'image',
    kind: 'local-texture',
    contrast: 255,
  };
}

function sampleCompoundBackgrounds(image) {
  const { data, width, height } = image;
  const bins = new Map();
  for (let y = 0; y < height; y += 3)
    for (let x = 0; x < width; x += 3) {
      let i = (y * width + x) * 4,
        k = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4),
        v = bins.get(k) || [0, 0, 0, 0];
      v[0]++;
      for (let c = 0; c < 3; c++) v[c + 1] += data[i + c];
      bins.set(k, v);
    }
  return [...bins.values()]
    .sort((a, b) => b[0] - a[0])
    .filter((a) => a[0] > ((width * height) / 9) * 0.03)
    .slice(0, 8)
    .map((a) => a.slice(1).map((c) => c / a[0]));
}

function createCompoundMask(image, bg) {
  const { data, width, height } = image;
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < mask.length; p++) {
    let i = p * 4;
    if (
      Math.max(
        Math.abs(bg[0] - data[i]),
        Math.abs(bg[1] - data[i + 1]),
        Math.abs(bg[2] - data[i + 2])
      ) > 12
    )
      mask[p] = 1;
  }
  return mask;
}

function hasCompoundPerimeterSupport(image, bounds, bg) {
  const { data, width } = image;
  const { l, r, t, b } = bounds;
  let supported = 0,
    n = 0;
  for (let x = l; x <= r; x++) {
    for (const y of [t - 1, b + 1]) {
      n++;
      if (colorDistanceAt(data, (y * width + x) * 4, bg) <= 12) supported++;
    }
  }
  for (let y = t; y <= b; y++) {
    for (const x of [l - 1, r + 1]) {
      n++;
      if (colorDistanceAt(data, (y * width + x) * 4, bg) <= 12) supported++;
    }
  }
  return !(supported / n < 0.95);
}

function compoundColorClusters(image, queue, tail) {
  const { data, width } = image;
  const colors = new Map();
  for (let z = 0; z < tail; z++) {
    const point = queue[z],
      i = point * 4,
      r = data[i],
      g = data[i + 1],
      b = data[i + 2],
      k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    // The caller has checked the component's strict interior bounds.
    if (
      rgbBin(data, i - 4) !== k ||
      rgbBin(data, i + 4) !== k ||
      rgbBin(data, i - width * 4) !== k ||
      rgbBin(data, i + width * 4) !== k
    )
      continue;
    const v = colors.get(k) || [0, 0, 0, 0];
    v[0]++;
    v[1] += r;
    v[2] += g;
    v[3] += b;
    colors.set(k, v);
  }
  return [...colors.values()]
    .filter((v) => v[0] >= Math.max(20, tail * 0.01))
    .map((v) => v.slice(1).map((n) => n / v[0]));
}

function hasCompoundColorVariation(clusters, bg) {
  let complex = false;
  for (const a of clusters)
    for (const b of clusters) {
      const u = a.map((v, i) => v - bg[i]),
        v = b.map((v, i) => v - bg[i]),
        ul = Math.hypot(...u),
        vl = Math.hypot(...v);
      if (
        Math.max(...a) - Math.min(...a) > 35 &&
        Math.max(...b) - Math.min(...b) > 35 &&
        ul > 35 &&
        vl > 35 &&
        u.reduce((n, x, i) => n + x * v[i], 0) / (ul * vl) < 0.85
      )
        complex = true;
    }
  return complex;
}

function findDisconnectedCompoundOwners(width, bounds, established, queue, tail) {
  const { l, r, t, b } = bounds;
  const enclosing = established.filter((q) => {
    const iw = Math.max(0, Math.min(r + 1, q.x + q.w) - Math.max(l, q.x)),
      ih = Math.max(0, Math.min(b + 1, q.y + q.h) - Math.max(t, q.y));
    return iw * ih >= q.w * q.h * 0.9;
  });
  const disconnected = [];
  for (const q of enclosing) {
    let support = 0;
    for (let z = 0; z < tail; z++) {
      const x = queue[z] % width,
        y = Math.floor(queue[z] / width);
      if (x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) support++;
    }
    if (support < q.w * q.h * 0.1) disconnected.push(q);
  }
  return disconnected;
}
