// Raster connectivity, graphic admission, and repeated small-image grouping.
import { resemblesTextList } from './media-surfaces.mjs';
const CARDINAL_LEFT = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const CARDINAL_RIGHT = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function detectGraphics(image, queue) {
  const { data, width, height } = image;
  const bg = dominantGraphicBackground(image);
  if (!bg) return [];
  const mask = new Uint8Array(width * height),
    out = [];
  for (let i = 0; i < mask.length; i++) {
    const j = i * 4;
    if (
      data[j + 3] > 128 &&
      Math.max(
        Math.abs(bg[0] - data[j]),
        Math.abs(bg[1] - data[j + 1]),
        Math.abs(bg[2] - data[j + 2])
      ) > 35
    )
      mask[i] = 1;
  }
  for (let i = mask.indexOf(1); i !== -1; i = mask.indexOf(1, i + 1)) {
    const { tail, left, right, top, bottom } = traceGraphicComponent(mask, width, height, i, queue);
    const w = right - left + 1,
      h = bottom - top + 1,
      density = tail / (w * h);
    if (w < 32 || h < 32 || w > 512 || h > 512 || w / h < 0.45 || w / h > 2.2 || density < 0.4)
      continue;
    if ((w < 64 || h < 64) && density <= 0.9) continue;
    let kind = 'isolated-graphic';
    if (density > 0.9) {
      if (!isTexturedGraphicSurface(image, left, top, right, bottom, w, h)) continue;
      kind = 'textured-surface';
    }
    out.push({ x: left, y: top, w, h, shape: 'image', bg: [...bg], contrast: 255, kind });
  }
  return out;
}

export function darkComponents(image, queue) {
  const { data, width, height } = image,
    mask = new Uint8Array(width * height),
    out = [];
  for (let i = 0; i < mask.length; i++)
    if (data[i * 4 + 3] > 128 && Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < 225)
      mask[i] = 1;
  for (let k = mask.indexOf(1); k !== -1; k = mask.indexOf(1, k + 1)) {
    let head = 0,
      tail = 1,
      left = width,
      right = 0,
      top = height,
      bottom = 0;
    queue[0] = k;
    mask[k] = 0;
    while (head < tail) {
      const p = queue[head++],
        x = p % width,
        y = Math.floor(p / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (const [dx, dy] of CARDINAL_RIGHT) {
        const xx = x + dx,
          yy = y + dy,
          j = yy * width + xx;
        if (xx >= 0 && xx < width && yy >= 0 && yy < height && mask[j]) {
          mask[j] = 0;
          queue[tail++] = j;
        }
      }
    }
    const w = right - left + 1,
      h = bottom - top + 1;
    // Neither consumer can accept a component smaller than this support.
    if (w >= 10 && h >= 10) out.push({ x: left, y: top, w, h, n: tail });
  }
  return out;
}

export function detectSmallImageGroups(image, rasterComponents) {
  const components = [],
    merged = [];
  for (const part of rasterComponents) appendSmallImageComponent(image, part, components, merged);
  appendMergedImageDiscs(components, merged);
  measureImageGroupColors(image, components);
  return components
    .filter((p) => {
      if (p.textured) return true;
      const peers = components.filter(
        (q) =>
          q.circle &&
          Math.abs(p.y + p.h / 2 - (q.y + q.h / 2)) <= Math.max(3, p.h * 0.15) &&
          Math.abs(p.h - q.h) <= p.h * 0.25 &&
          Math.abs(p.w - q.w) <= p.w * 0.25 &&
          Math.abs(p.x - q.x) <= p.w * 2.5
      );
      return (
        p.circle &&
        peers.length >= 3 &&
        peers.some((a) =>
          peers.some((b) => Math.max(...a.mean.map((v, c) => Math.abs(v - b.mean[c]))) > 35)
        )
      );
    })
    .map(({ circle: _circle, textured: _textured, mean: _mean, ...box }) => box);
}

function dominantGraphicBackground(image) {
  const { data, width, height } = image,
    bins = new Map();
  let total = 0;
  for (let y = 0; y < height; y += 4)
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4,
        k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4),
        b = bins.get(k) || [0, 0, 0, 0];
      b[0]++;
      b[1] += data[i];
      b[2] += data[i + 1];
      b[3] += data[i + 2];
      bins.set(k, b);
      total++;
    }
  const bin = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
  if (!bin || bin[0] / total < 0.55) return null;
  return bin.slice(1).map((v) => Math.round(v / bin[0]));
}

function traceGraphicComponent(mask, width, height, seed, queue) {
  let head = 0,
    tail = 1,
    left = width,
    right = 0,
    top = height,
    bottom = 0;
  queue[0] = seed;
  mask[seed] = 2;
  while (head < tail) {
    const n = queue[head++],
      x = n % width,
      y = Math.floor(n / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    for (const [dx, dy] of CARDINAL_LEFT) {
      const xx = x + dx,
        yy = y + dy,
        j = yy * width + xx;
      if (xx >= 0 && xx < width && yy >= 0 && yy < height && mask[j] === 1) {
        mask[j] = 2;
        queue[tail++] = j;
      }
    }
  }
  return { tail, left, right, top, bottom };
}

function isTexturedGraphicSurface(image, left, top, right, bottom, w, h) {
  const { data, width } = image;
  const colors = new Set();
  let rough = 0,
    samples = 0;
  for (let y = top + 3; y < bottom - 3; y += 2)
    for (let x = left + 3; x < right - 3; x += 2) {
      const i = (y * width + x) * 4,
        j = i + 4;
      colors.add([data[i] >> 4, data[i + 1] >> 4, data[i + 2] >> 4].join(','));
      samples++;
      if (Math.max(...[0, 1, 2].map((c) => Math.abs(data[i + c] - data[j + c]))) >= 10) rough++;
    }
  if (
    colors.size < 24 ||
    rough / Math.max(1, samples) < 0.4 ||
    resemblesTextList(image, { x: left, y: top, w, h })
  )
    return false;
  return true;
}

function measureSmallImageTexture(image, part) {
  const { data, width } = image;
  const left = part.x,
    top = part.y,
    right = part.x + part.w - 1,
    bottom = part.y + part.h - 1;
  const w = part.w,
    h = part.h;
  const bins = new Set();
  let corners = 0,
    strongEdges = 0,
    edgeSamples = 0;
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const i = (y * width + x) * 4;
      bins.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
      if (x >= left + 2 && x < right - 2 && y >= top + 2 && y < bottom - 2) {
        const j = i + 4,
          k = i + width * 4,
          diff = (q) =>
            Math.abs(data[i] - data[q]) +
            Math.abs(data[i + 1] - data[q + 1]) +
            Math.abs(data[i + 2] - data[q + 2]);
        edgeSamples++;
        if (diff(j) > 70 || diff(k) > 70) strongEdges++;
      }
      if (
        (x - left < w * 0.2 || right - x < w * 0.2) &&
        (y - top < h * 0.2 || bottom - y < h * 0.2) &&
        Math.min(data[i], data[i + 1], data[i + 2]) < 225
      )
        corners++;
    }
  return { colors: bins.size, corners, strongEdges, edgeSamples };
}

function appendMergedImageDiscs(components, merged) {
  for (const box of merged) {
    const peers = components.filter(
      (p) =>
        p.circle &&
        Math.abs(p.y + p.h / 2 - (box.y + box.h / 2)) <= Math.max(3, box.h * 0.15) &&
        Math.abs(p.h - box.h) <= box.h * 0.25 &&
        Math.min(Math.abs(p.x - (box.x + box.w)), Math.abs(p.x + p.w - box.x)) <= box.h * 0.35
    );
    if (!peers.length) continue;
    const count = Math.round(box.w / box.h);
    if (count < 2 || count > 4) continue;
    for (let i = 0; i < count; i++) {
      const left = box.x + Math.round((box.w * i) / count),
        right = box.x + Math.round((box.w * (i + 1)) / count);
      components.push({
        x: left,
        y: box.y,
        w: right - left,
        h: box.h,
        shape: 'image',
        bg: peers[0].bg,
        contrast: 255,
        kind: 'small-image-group',
        circle: true,
        textured: false,
      });
    }
  }
}

function measureImageGroupColors(image, components) {
  const { data, width } = image;
  for (const p of components) {
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = p.y; y < p.y + p.h; y++)
      for (let x = p.x; x < p.x + p.w; x++) {
        const i = (y * width + x) * 4;
        if (Math.min(data[i], data[i + 1], data[i + 2]) >= 225) continue;
        for (let c = 0; c < 3; c++) sum[c] += data[i + c];
        n++;
      }
    p.mean = sum.map((v) => v / Math.max(1, n));
  }
}

function appendSmallImageComponent(image, part, components, merged) {
  const { data, width, height } = image;
  const left = part.x,
    top = part.y,
    right = part.x + part.w - 1,
    bottom = part.y + part.h - 1,
    tail = part.n;
  const w = right - left + 1,
    h = bottom - top + 1,
    density = tail / (w * h);
  if (h >= 12 && h <= 70 && w / h >= 1.6 && w / h <= 4.5 && density > 0.55 && density < 0.9)
    merged.push({ x: left, y: top, w, h });
  if (
    w < 12 ||
    h < 12 ||
    w > 110 ||
    h > 70 ||
    w / h < 0.8 ||
    w / h > 1.8 ||
    density < 0.5 ||
    density > 0.99
  )
    return;
  const { colors, corners, strongEdges, edgeSamples } = measureSmallImageTexture(image, part);
  if (colors < 8) return;
  const circle = w / h >= 0.8 && w / h <= 1.25 && density <= 0.9 && corners <= w * h * 0.08;
  const textured =
    w >= 22 &&
    h >= 22 &&
    colors >= 70 &&
    density >= 0.55 &&
    (w / h > 1.25 || strongEdges / Math.max(1, edgeSamples) > 0.28);
  if (!circle && !textured) return;
  const samples = [];
  for (const [x, y] of [
    [left - 2, top - 2],
    [right + 2, top - 2],
    [left - 2, bottom + 2],
    [right + 2, bottom + 2],
  ])
    if (x >= 0 && y >= 0 && x < width && y < height) {
      const i = (y * width + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  const bg = [0, 1, 2].map((ch) => {
    const a = samples.map((v) => v[ch]).sort((a, b) => a - b);
    return a[Math.floor(a.length / 2)] ?? 255;
  });
  components.push({
    x: left,
    y: top,
    w,
    h,
    shape: 'image',
    bg,
    contrast: 255,
    kind: 'small-image-group',
    circle,
    textured,
  });
}
