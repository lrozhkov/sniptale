import { sampleBackground } from './detector-background.mjs';

/** Cleanup-only fallback for continuous illustrations that have little photographic texture. */
export function findCleanupMedia(image, region) {
  const { width, height, data } = image;
  const bg = sampleBackground(image, { x: 0, y: 0, w: width, h: height });
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    if (
      data[p + 3] >= 128 &&
      Math.max(
        Math.abs(data[p] - bg[0]),
        Math.abs(data[p + 1] - bg[1]),
        Math.abs(data[p + 2] - bg[2])
      ) > 24
    )
      mask[i] = 1;
  }
  const boxes = [];
  const colors = new Uint32Array(512);
  for (let seed = 0; seed < mask.length; seed++) {
    if (mask[seed] !== 1) continue;
    colors.fill(0);
    let end = 1,
      left = width,
      top = height,
      right = 0,
      bottom = 0,
      dominant = 0;
    queue[0] = seed;
    mask[seed] = 2;
    for (let read = 0; read < end; read++) {
      const i = queue[read],
        x = i % width,
        y = Math.floor(i / width),
        p = i * 4;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const color = (data[p] >> 5) * 64 + (data[p + 1] >> 5) * 8 + (data[p + 2] >> 5);
      dominant = Math.max(dominant, ++colors[color]);
      for (const next of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, i - width, i + width]) {
        if (next < 0 || next >= mask.length || mask[next] !== 1) continue;
        mask[next] = 2;
        queue[end++] = next;
      }
    }
    const w = right - left + 1,
      h = bottom - top + 1;
    // Thin borders/separators and uniform panels are structural background, not media.
    if (w < 32 || h < 32 || end < w * h * 0.4 || dominant > end * 0.72) continue;
    if (left === 0 || top === 0 || right === width - 1 || bottom === height - 1) continue;
    if (
      right < region.x ||
      bottom < region.y ||
      left >= region.x + region.width ||
      top >= region.y + region.height
    )
      continue;
    if (isSmoothSurface(image, { x: left, y: top, w, h })) continue;
    boxes.push({ x: left, y: top, w, h, bg: sampleBackground(image, { x: left, y: top, w, h }) });
  }
  return boxes;
}

function isSmoothSurface(image, b) {
  const pixel = (x, y) => {
    const p = (y * image.width + x) * 4;
    return [image.data[p], image.data[p + 1], image.data[p + 2]];
  };
  const corners = [
    pixel(b.x, b.y),
    pixel(b.x + b.w - 1, b.y),
    pixel(b.x, b.y + b.h - 1),
    pixel(b.x + b.w - 1, b.y + b.h - 1),
  ];
  let changed = 0;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const u = (col + 0.5) / 8,
        v = (row + 0.5) / 8;
      const observed = pixel(b.x + Math.floor(u * (b.w - 1)), b.y + Math.floor(v * (b.h - 1)));
      const error = Math.max(
        ...observed.map((value, c) =>
          Math.abs(
            value -
              (corners[0][c] * (1 - u) * (1 - v) +
                corners[1][c] * u * (1 - v) +
                corners[2][c] * (1 - u) * v +
                corners[3][c] * u * v)
          )
        )
      );
      if (error > 18) changed++;
    }
  return changed <= 12;
}
