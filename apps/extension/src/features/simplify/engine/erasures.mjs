import { denseTextErase } from './dense-text-erase.mjs';
import { orderStatistic } from './order-statistic.mjs';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const median = (a) => orderStatistic([...a], Math.floor(a.length / 2));
function corner(image, x, y) {
  const values = [[], [], [], []];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const xx = clamp(Math.round(x + dx), 0, image.width - 1),
        yy = clamp(Math.round(y + dy), 0, image.height - 1),
        p = (yy * image.width + xx) * 4;
      for (let c = 0; c < 4; c++) values[c].push(image.data[p + c]);
    }
  return values.map(median);
}
function planeAt(plane, x, y) {
  const u = clamp((x - plane.x) / Math.max(1, plane.w - 1), 0, 1),
    v = clamp((y - plane.y) / Math.max(1, plane.h - 1), 0, 1);
  const a = plane.corners[0],
    b = plane.corners[1],
    c = plane.corners[2],
    d = plane.corners[3];
  return [
    (a[0] * (1 - u) + b[0] * u) * (1 - v) + (c[0] * (1 - u) + d[0] * u) * v,
    (a[1] * (1 - u) + b[1] * u) * (1 - v) + (c[1] * (1 - u) + d[1] * u) * v,
    (a[2] * (1 - u) + b[2] * u) * (1 - v) + (c[2] * (1 - u) + d[2] * u) * v,
    (a[3] * (1 - u) + b[3] * u) * (1 - v) + (c[3] * (1 - u) + d[3] * u) * v,
  ];
}
function sourcePlane(image, box) {
  const stride = image.width,
    rasterHeight = image.height;
  const x = box.x,
    y = box.y,
    w = box.w,
    h = box.h;
  const locations = [
    [x - 2, y - 2],
    [x + w + 1, y - 2],
    [x - 2, y + h + 1],
    [x + w + 1, y + h + 1],
  ];
  const observed = locations.map(([xx, yy]) =>
    xx < 0 || yy < 0 || xx >= stride || yy >= rasterHeight ? null : corner(image, xx, yy)
  );
  // An unavailable corner cannot acquire a foreground color by clamping.
  // Retain the nearest observed plane endpoint, including its alpha.
  let corners = observed.map((value, i) => {
    if (value) return value;
    const nearest = observed
      .map((color, j) => ({
        color,
        d: Math.hypot(locations[j][0] - locations[i][0], locations[j][1] - locations[i][1]),
      }))
      .filter((p) => p.color)
      .sort((a, b) => a.d - b.d)[0];
    return nearest ? [...nearest.color] : [...box.bg, corner(image, ...locations[i])[3]];
  });
  const initialPlane = { x, y, w, h, corners };
  const { support, counts, surfaceSamples, planeResidual } = measureSourceSurface(
    image,
    box,
    initialPlane
  );
  const surfaces = surfaceSamples.map((samples) =>
    [0, 1, 2].map((c) => (samples.length ? median(samples.map((p) => p[c])) : box.bg[c]))
  );
  const flat =
    support.every((n, i) => n / Math.max(1, counts[i]) >= 0.3) &&
    support.reduce((a, b) => a + b, 0) /
      Math.max(
        1,
        counts.reduce((a, b) => a + b, 0)
      ) >=
      0.45 &&
    Math.max(
      ...[0, 1, 2].map(
        (c) => Math.max(...surfaces.map((p) => p[c])) - Math.min(...surfaces.map((p) => p[c]))
      )
    ) <= 8;
  const flatColor = [0, 1, 2].map((i) => median(surfaces.map((p) => p[i])));
  const flatError =
    median(
      surfaceSamples.flat().map((p) => Math.max(...p.map((v, c) => Math.abs(v - flatColor[c]))))
    ) || 0;
  const useFlat = flat && flatError + 1 < (median(planeResidual) || 0);
  if (useFlat) corners = corners.map((c) => [...flatColor, c[3]]);
  const bend = Math.max(
    ...[0, 1, 2].map((c) =>
      Math.abs(corners[0][c] + corners[3][c] - (corners[1][c] + corners[2][c]))
    )
  );
  // A large smooth gradient is valid. Reject incompatible corner surfaces, not amplitude.
  if (!useFlat && (bend > 48 || box.surfaceClip)) corners = corners.map((c) => [...box.bg, c[3]]);
  return { x, y, w, h, corners };
}
function expandRect(image, box, margin) {
  const clip = box.surfaceClip || { x: 0, y: 0, w: image.width, h: image.height };
  const x = Math.max(0, clip.x, Math.floor(box.x - margin)),
    y = Math.max(0, clip.y, Math.floor(box.y - margin));
  return {
    x,
    y,
    w: Math.min(image.width, clip.x + clip.w, Math.ceil(box.x + box.w + margin)) - x,
    h: Math.min(image.height, clip.y + clip.h, Math.ceil(box.y + box.h + margin)) - y,
  };
}

/** Store only source ink and its local surface, independent of paint style. */
export function attachEraseSupport(image, box) {
  if (box.eraseFragments) {
    const eraseLayers = box.eraseFragments.map((fragment) =>
      attachEraseSupport(image, { ...fragment, shape: 'text', eraseFragments: undefined })
    );
    return { ...box, eraseLayers };
  }
  if (box.shape === 'icon' && box.sourceRuns) {
    return attachIconEraseSupport(image, box);
  }
  if (box.shape !== 'text') return box;
  const bounds = expandRect(image, box, 2),
    plane = sourcePlane(image, box);
  if (
    ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isInteger) ||
    bounds.w < 0 ||
    bounds.h < 0
  )
    return legacyTextErase(image, box, bounds, plane);
  return denseTextErase(image, box, bounds, plane);
}

function legacyTextErase(image, box, bounds, plane) {
  const samples = sampleLegacyText(image, bounds, plane);
  const distances = samples.map((p) => p.delta),
    peak = orderStatistic(distances, Math.floor((distances.length - 1) * 0.95)) || 0,
    bins = new Map();
  for (const p of samples)
    if (p.delta >= Math.max(12, peak * 0.55)) {
      const key = p.rgb.map((v) => v >> 4).join(','),
        b = bins.get(key) || { count: 0, color: [0, 0, 0] };
      b.count++;
      for (let c = 0; c < 3; c++) b.color[c] += p.rgb[c];
      bins.set(key, b);
    }
  const palette = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((b) => b.color.map((v) => v / b.count));
  const core = new Uint8Array(bounds.w * bounds.h),
    mask = new Uint8Array(core.length);
  seedLegacyTextCore(samples, box, bounds, palette, core);
  expandLegacyTextSupport(samples, bounds, core, mask);
  completeLegacyTextFringe(samples, box, bounds, peak, mask);
  const runs = [];
  for (let y = 0; y < bounds.h; y++)
    for (let x = 0; x < bounds.w;) {
      if (!mask[y * bounds.w + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < bounds.w && mask[y * bounds.w + x]) x++;
      runs.push([bounds.y + y, bounds.x + start, x - start]);
    }
  return { ...box, eraseRuns: runs, erasePlane: plane };
}

export function eraseOwned(ctx, box) {
  if (box.eraseLayers) {
    for (const layer of box.eraseLayers) eraseOwned(ctx, layer);
    return;
  }
  const runs = box.eraseRuns || box.sourceRuns;
  if (!runs) {
    const b = box.eraseBounds || box.sourceBounds || box;
    ctx.fillStyle = `rgb(${box.bg.join(',')})`;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    return;
  }
  const plane = box.erasePlane;
  if (!plane) {
    ctx.fillStyle = `rgb(${box.bg.join(',')})`;
    for (const [y, x, w] of runs) ctx.fillRect(x, y, w, 1);
    return;
  }
  let lastY = -1,
    style;
  for (const [y, x, w] of runs) {
    if (y !== lastY) {
      const left = planeAt(plane, plane.x, y),
        right = planeAt(plane, plane.x + plane.w - 1, y);
      const rgba = (c) =>
        `rgba(${c
          .slice(0, 3)
          .map((v) => Math.round(v))
          .join(',')},${c[3] / 255})`;
      if (left.every((v, c) => Math.abs(v - right[c]) < 0.5)) style = rgba(left);
      else {
        style = ctx.createLinearGradient(plane.x, y, plane.x + plane.w, y);
        style.addColorStop(0, rgba(left));
        style.addColorStop(1, rgba(right));
      }
      lastY = y;
    }
    if (plane.corners.some((c) => c[3] < 255)) ctx.clearRect(x, y, w, 1);
    ctx.fillStyle = style;
    ctx.fillRect(x, y, w, 1);
  }
}

function measureSourceSurface(image, box, initialPlane) {
  const pixels = image.data,
    stride = image.width,
    rasterHeight = image.height;
  const { x, y, w, h } = box;
  const support = [0, 0, 0, 0],
    counts = [0, 0, 0, 0],
    surfaceSamples = [[], [], [], []],
    planeResidual = [];
  for (let yy = Math.max(0, Math.ceil(y)); yy < Math.min(rasterHeight, y + h); yy++)
    for (let xx = Math.max(0, Math.ceil(x)); xx < Math.min(stride, x + w); xx++) {
      const at = (yy * stride + xx) * 4,
        q = (yy >= y + h / 2 ? 2 : 0) + (xx >= x + w / 2 ? 1 : 0);
      counts[q]++;
      if (
        Math.max(
          Math.abs(box.bg[0] - pixels[at]),
          Math.abs(box.bg[1] - pixels[at + 1]),
          Math.abs(box.bg[2] - pixels[at + 2])
        ) <= 8
      ) {
        support[q]++;
        surfaceSamples[q].push([pixels[at], pixels[at + 1], pixels[at + 2]]);
        const predicted = planeAt(initialPlane, xx, yy);
        planeResidual.push(
          Math.max(
            Math.abs(pixels[at] - predicted[0]),
            Math.abs(pixels[at + 1] - predicted[1]),
            Math.abs(pixels[at + 2] - predicted[2])
          )
        );
      }
    }
  return { support, counts, surfaceSamples, planeResidual };
}

function sampleLegacyText(image, bounds, plane) {
  const pixels = image.data,
    stride = image.width,
    samples = [];
  for (let y = bounds.y; y < bounds.y + bounds.h; y++)
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const i = (y * stride + x) * 4;
      if (pixels[i + 3] < 128) continue;
      const bg = planeAt(plane, x, y),
        rgb = [pixels[i], pixels[i + 1], pixels[i + 2]],
        delta = Math.max(
          Math.abs(rgb[0] - bg[0]),
          Math.abs(rgb[1] - bg[1]),
          Math.abs(rgb[2] - bg[2])
        );
      samples.push({ x, y, rgb, bg, delta });
    }
  return samples;
}

function seedLegacyTextCore(samples, box, bounds, palette, core) {
  for (const p of samples) {
    // Outside pixels can complete antialiasing, but cannot seed a new owner.
    if (p.x < box.x || p.x >= box.x + box.w || p.y < box.y || p.y >= box.y + box.h || p.delta < 6)
      continue;
    const strong = palette.some((color) => {
      const d0 = color[0] - p.bg[0],
        d1 = color[1] - p.bg[1],
        d2 = color[2] - p.bg[2],
        length = d0 * d0 + d1 * d1 + d2 * d2;
      if (length < 36) return false;
      const r = p.rgb[0] - p.bg[0],
        g = p.rgb[1] - p.bg[1],
        b = p.rgb[2] - p.bg[2],
        alpha = (r * d0 + g * d1 + b * d2) / length;
      return (
        alpha >= 0.25 &&
        alpha <= 1.25 &&
        Math.max(Math.abs(r - alpha * d0), Math.abs(g - alpha * d1), Math.abs(b - alpha * d2)) <= 12
      );
    });
    if (strong) core[(p.y - bounds.y) * bounds.w + p.x - bounds.x] = 1;
  }
}

function expandLegacyTextSupport(samples, bounds, core, mask) {
  for (const p of samples) {
    if (p.delta <= 2) continue;
    const x = p.x - bounds.x,
      y = p.y - bounds.y;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < bounds.w && yy < bounds.h && core[yy * bounds.w + xx])
          mask[y * bounds.w + x] = 1;
      }
  }
}

function completeLegacyTextFringe(samples, box, bounds, peak, mask) {
  // The accepted text owns every visible foreground island inside its support,
  // including detached accents and subpixel colors absent from the common palette.
  for (const p of samples)
    if (p.x >= box.x && p.x < box.x + box.w && p.y >= box.y && p.y < box.y + box.h && p.delta > 8)
      mask[(p.y - bounds.y) * bounds.w + p.x - bounds.x] = 1;
  // Subpixel rendering can leave a colored fringe beyond the neutral core.
  // Extend only one orthogonal step from owned ink and only at substantial contrast.
  const fringe = new Uint8Array(mask);
  for (const p of samples) {
    const x = p.x - bounds.x,
      y = p.y - bounds.y,
      i = y * bounds.w + x;
    if (
      mask[i] ||
      Math.max(...p.rgb.map((v, c) => Math.abs(v - box.bg[c]))) < Math.max(24, peak * 0.12)
    )
      continue;
    if (
      (x > 0 && mask[i - 1]) ||
      (x + 1 < bounds.w && mask[i + 1]) ||
      (y > 0 && mask[i - bounds.w]) ||
      (y + 1 < bounds.h && mask[i + bounds.w])
    )
      fringe[i] = 1;
  }
  mask.set(fringe);
}

function sampleIconPalette(runs, pixels, stride, plane, owned, identity, palette) {
  for (const [y, x, w] of runs)
    for (let px = x; px < x + w; px++) {
      owned.add(identity(px, y));
      const i = (y * stride + px) * 4,
        bg = planeAt(plane, px, y),
        delta = [0, 1, 2].map((c) => pixels[i + c] - bg[c]);
      if (Math.max(...delta.map(Math.abs)) < 20) continue;
      const key = delta.map((v) => Math.round(v / 16)).join(','),
        bin = palette.get(key) || { n: 0, sum: [0, 0, 0] };
      bin.n++;
      for (let c = 0; c < 3; c++) bin.sum[c] += delta[c];
      palette.set(key, bin);
    }
}

function hasAdjacentOwnedPoint(x, y, hasPoint) {
  let adjacent = false;
  for (let dy = -1; dy <= 1 && !adjacent; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (hasPoint(x + dx, y + dy)) {
        adjacent = true;
        break;
      }
  return adjacent;
}

function hasMatchingOwnedNeighbor(pixels, stride, i, x, y, hasPoint) {
  let neighbor = false;
  for (let dy = -1; dy <= 1 && !neighbor; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (hasPoint(x + dx, y + dy)) {
        const j = ((y + dy) * stride + x + dx) * 4;
        if (
          Math.max(
            Math.abs(pixels[i] - pixels[j]),
            Math.abs(pixels[i + 1] - pixels[j + 1]),
            Math.abs(pixels[i + 2] - pixels[j + 2])
          ) <= 10
        ) {
          neighbor = true;
          break;
        }
      }
  return neighbor;
}

function attachIconEraseSupport(image, box) {
  const pixels = image.data,
    stride = image.width,
    rasterHeight = image.height;
  const plane = sourcePlane(image, { ...box, ...box.sourceBounds }),
    owned = new Set(),
    palette = new Map(),
    bounds = box.sourceBounds || box;
  const numeric =
    [box.x, box.y, box.w, box.h, bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isInteger) &&
    box.sourceRuns.every(
      ([y, x, w]) =>
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        Number.isInteger(w) &&
        w >= 0 &&
        x >= 0 &&
        y >= 0 &&
        x + w <= stride &&
        y < rasterHeight
    );
  const identity = (x, y) => (numeric ? y * stride + x : `${x},${y}`);
  const hasPoint = (x, y) =>
    numeric
      ? x >= 0 && x < stride && y >= 0 && y < rasterHeight && owned.has(y * stride + x)
      : owned.has(`${x},${y}`);
  sampleIconPalette(box.sourceRuns, pixels, stride, plane, owned, identity, palette);
  const colors = [...palette.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
      .map((b) => b.sum.map((v) => v / b.n)),
    added = [];
  for (let step = 1; step <= 4; step++) {
    const next = [];
    for (
      let y = Math.max(0, box.y - 2, bounds.y - step);
      y < Math.min(rasterHeight, box.y + box.h + 2, bounds.y + bounds.h + step);
      y++
    )
      for (
        let x = Math.max(0, box.x - 2, bounds.x - step);
        x < Math.min(stride, box.x + box.w + 2, bounds.x + bounds.w + step);
        x++
      ) {
        if (hasPoint(x, y)) continue;
        if (!hasAdjacentOwnedPoint(x, y, hasPoint)) continue;
        const i = (y * stride + x) * 4,
          bg = planeAt(plane, x, y),
          delta = [0, 1, 2].map((c) => pixels[i + c] - bg[c]);
        if (Math.max(...delta.map(Math.abs)) < 5) continue;
        const matches = colors.some((color) => {
          const length = color.reduce((n, v) => n + v * v, 0),
            alpha = delta.reduce((n, v, c) => n + v * color[c], 0) / length;
          return (
            alpha >= 0.12 &&
            alpha <= 1.3 &&
            Math.max(...delta.map((v, c) => Math.abs(v - alpha * color[c]))) <= 8
          );
        });
        const neighbor = hasMatchingOwnedNeighbor(pixels, stride, i, x, y, hasPoint);
        if (matches || neighbor) next.push([y, x, 1]);
      }
    for (const run of next) {
      added.push(run);
      owned.add(identity(run[1], run[0]));
    }
  }
  const runs = [...box.sourceRuns, ...added];
  return { ...box, sourceRuns: runs, eraseRuns: runs, erasePlane: plane };
}
