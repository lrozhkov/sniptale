// Grow compact illustration islands around established graphics, then trace their backdrop extent.
export function detectIllustrationIslands(image, graphics, rasterComponents) {
  const { width, height } = image;
  const parts = rasterComponents.filter(
    (p) =>
      p.w >= 10 && p.h >= 10 && p.w <= 180 && p.h <= 180 && p.n >= 50 && p.n / (p.w * p.h) > 0.15
  );
  const out = [];
  for (const seed of graphics) {
    if (
      seed.kind !== 'isolated-graphic' ||
      seed.w < 45 ||
      seed.h < 45 ||
      seed.w > 180 ||
      seed.h > 180
    )
      continue;
    const selected = selectIllustrationParts(seed, parts);
    if (selected.size < 3) continue;
    const group = [...selected].map((i) => parts[i]),
      left = Math.min(...group.map((p) => p.x)),
      top = Math.min(...group.map((p) => p.y)),
      right = Math.max(...group.map((p) => p.x + p.w)),
      bottom = Math.max(...group.map((p) => p.y + p.h));
    const w = right - left,
      h = bottom - top;
    if (
      w < 100 ||
      h < 100 ||
      w > 300 ||
      h > 250 ||
      w * h < seed.w * seed.h * 1.5 ||
      !group.some((p) => p.h > seed.h * 0.8 && (p.x < seed.x || p.x + p.w > seed.x + seed.w))
    )
      continue;
    const padding = Math.max(2, Math.round(Math.min(w, h) * 0.025));
    let x = Math.max(0, left - padding);
    const y = Math.max(0, top - padding);
    let endX = Math.min(width, right + padding),
      endY = Math.min(height, bottom + padding);
    // Continue a faint backdrop only where the two sides agree on a light
    // surrounding surface. Stop when consecutive rows contain no support.
    const limit = Math.max(3, Math.round(Math.min(w, h) * 0.09));
    endY = extendIllustrationBottom(image, x, endX, endY, w, limit);
    // A horizontal ground stroke may project beyond the opaque illustration.
    // Trace only rows already supported across a substantial part of it.
    const core = { x: left, y: top, w, h };
    endX = extendIllustrationRight(image, { x, y, w: endX - x }, core, padding, limit);
    x = extendIllustrationLeft(image, { x, y, w: endX - x }, core, padding, limit);
    out.push({
      x,
      y,
      w: endX - x,
      h: endY - y,
      shape: 'image',
      bg: seed.bg,
      contrast: 255,
      kind: 'illustration-island',
    });
  }
  return out;
}

function selectIllustrationParts(seed, parts) {
  const selected = new Set();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i],
      iw = Math.max(0, Math.min(seed.x + seed.w, p.x + p.w) - Math.max(seed.x, p.x)),
      ih = Math.max(0, Math.min(seed.y + seed.h, p.y + p.h) - Math.max(seed.y, p.y));
    if (iw * ih > p.w * p.h * 0.5) selected.add(i);
  }
  if (!selected.size) return selected;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < parts.length; i++) {
      if (selected.has(i)) continue;
      const p = parts[i];
      for (const j of selected) {
        const q = parts[j],
          dx = Math.max(0, p.x - (q.x + q.w), q.x - (p.x + p.w)),
          dy = Math.max(0, p.y - (q.y + q.h), q.y - (p.y + p.h));
        if (
          dx <= 18 &&
          dy <= 18 &&
          Math.hypot(dx, dy) <= 20 &&
          Math.abs(p.x + p.w / 2 - (seed.x + seed.w / 2)) < seed.w * 1.3 &&
          Math.abs(p.y + p.h / 2 - (seed.y + seed.h / 2)) < seed.h * 1.5
        ) {
          selected.add(i);
          changed = true;
          break;
        }
      }
    }
  }
  return selected;
}

function extendIllustrationBottom(image, x, endX, endY, w, limit) {
  const { data, width, height } = image;
  let empty = 0,
    last = endY;
  for (let yy = endY; yy < Math.min(height, endY + limit); yy++) {
    const lx = x - limit,
      rx = endX + limit;
    if (lx < 0 || rx >= width) break;
    const a = (yy * width + lx) * 4,
      b = (yy * width + rx) * 4;
    if (
      Math.min(data[a], data[a + 1], data[a + 2], data[b], data[b + 1], data[b + 2]) < 240 ||
      Math.max(...[0, 1, 2].map((c) => Math.abs(data[a + c] - data[b + c]))) > 6
    )
      break;
    let support = 0;
    for (let xx = x; xx < endX; xx++) {
      const i = (yy * width + xx) * 4;
      if (
        [0, 1, 2].reduce((v, c) => v + Math.abs(data[i + c] - (data[a + c] + data[b + c]) / 2), 0) >
        5
      )
        support++;
    }
    if (support > Math.max(6, w * 0.04)) {
      last = yy + 1;
      empty = 0;
    } else if (++empty >= 2) break;
  }
  return last;
}

function extendIllustrationRight(image, region, core, padding, limit) {
  const { data, width, height } = image;
  const { x, y, w: regionWidth } = region;
  const { w, h } = core,
    bottom = core.y + core.h;
  let endX = x + regionWidth;
  const originalEndX = endX;
  for (
    let yy = Math.max(y, bottom - Math.ceil(h * 0.08));
    yy < Math.min(height, bottom + padding);
    yy++
  ) {
    const reference = originalEndX + limit;
    if (reference >= width) continue;
    const differs = supportedIllustrationRow(data, width, yy, reference, x, endX, w);
    if (!differs) continue;
    let candidate = originalEndX;
    for (let xx = originalEndX; xx < Math.min(width, originalEndX + limit); xx++) {
      if (!differs(xx)) break;
      candidate = xx + 1;
    }
    endX = Math.max(endX, candidate);
  }
  return endX;
}

function extendIllustrationLeft(image, region, core, padding, limit) {
  const { data, width, height } = image;
  let { x } = region;
  const { y } = region,
    endX = region.x + region.w;
  const { w, h } = core,
    bottom = core.y + core.h;
  const originalX = x;
  for (
    let yy = Math.max(y, bottom - Math.ceil(h * 0.08));
    yy < Math.min(height, bottom + padding);
    yy++
  ) {
    const reference = originalX - limit;
    if (reference < 0) continue;
    const differs = supportedIllustrationRow(data, width, yy, reference, x, endX, w);
    if (!differs) continue;
    let candidate = originalX;
    for (let xx = originalX - 1; xx >= Math.max(0, originalX - limit); xx--) {
      if (!differs(xx)) break;
      candidate = xx;
    }
    x = Math.min(x, candidate);
  }
  return x;
}

function supportedIllustrationRow(data, width, y, reference, x, endX, w) {
  const j = (y * width + reference) * 4;
  if (Math.min(data[j], data[j + 1], data[j + 2]) < 240) return null;
  const differs = (xx) => {
    const i = (y * width + xx) * 4;
    return (
      Math.abs(data[i] - data[j]) +
        Math.abs(data[i + 1] - data[j + 1]) +
        Math.abs(data[i + 2] - data[j + 2]) >
      15
    );
  };
  let support = 0;
  for (let xx = x; xx < endX; xx++) if (differs(xx)) support++;
  return support < w * 0.3 ? null : differs;
}
