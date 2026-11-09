// Compare complete RGBA pixels; byte order does not affect equality.
function uniformTile(packed, stride, left, top, right, bottom) {
  const first = packed[top * stride + left];
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) if (packed[y * stride + x] !== first) return false;
  return true;
}
const BRIGHT_OFFSETS = [
  [-3, 0],
  [3, 0],
  [0, -3],
  [0, 3],
  [-3, -3],
  [3, -3],
  [-3, 3],
  [3, 3],
];
const key = (r, g, b) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
export function foregroundMask(image, detail, tileSize, cache = null) {
  const { data, width: w, height: h } = image,
    size = tileSize,
    cols = Math.ceil(w / size),
    rows = Math.ceil(h / size);
  let grids = cache?.get(image);
  if (cache && !grids) {
    grids = new Map();
    cache.set(image, grids);
  }
  let backgrounds = grids?.get(tileSize);
  const packed =
    ArrayBuffer.isView(data) &&
    data.BYTES_PER_ELEMENT === 1 &&
    data.byteOffset % 4 === 0 &&
    data.byteLength >= w * h * 4
      ? new Uint32Array(data.buffer, data.byteOffset, w * h)
      : null;
  if (!backgrounds) {
    backgrounds = [];
    const counts = new Uint32Array(4096),
      red = new Float64Array(4096),
      green = new Float64Array(4096),
      blue = new Float64Array(4096),
      touched = new Uint16Array(4096);
    for (let ty = 0; ty < rows; ty++)
      for (let tx = 0; tx < cols; tx++) {
        if (
          packed &&
          uniformTile(
            packed,
            w,
            tx * size,
            ty * size,
            Math.min(w, (tx + 1) * size),
            Math.min(h, (ty + 1) * size)
          )
        ) {
          backgrounds.push(null);
          continue;
        }
        backgrounds.push(
          sampleTileBackground(data, w, h, size, tx, ty, counts, red, green, blue, touched)
        );
      }
    grids?.set(tileSize, backgrounds);
  }
  return classifyTileForeground(data, w, h, size, cols, rows, backgrounds, detail);
}
export function brightForegroundMask(image, detail) {
  const { data, width: w, height: h } = image,
    mask = new Uint8Array(w * h),
    threshold = 100 - detail * 0.8;
  // Visit colored neighbors, not every light pixel and its eight neighbors.
  // Every qualifying edge contributes once to the same center counter.
  const counts = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4,
        max = Math.max(data[j], data[j + 1], data[j + 2]),
        min = Math.min(data[j], data[j + 1], data[j + 2]);
      if (max - min <= 40 || min >= 150) continue;
      for (const [dx, dy] of BRIGHT_OFFSETS) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const n = ny * w + nx,
          k = n * 4;
        if (data[k + 3] < 128 || Math.min(data[k], data[k + 1], data[k + 2]) < 165) continue;
        if (
          Math.max(data[k] - data[j], data[k + 1] - data[j + 1], data[k + 2] - data[j + 2]) >
            threshold &&
          ++counts[n] >= 2
        )
          mask[n] = 1;
      }
    }
  return mask;
}

function sampleTileBackground(data, w, h, size, tx, ty, counts, red, green, blue, touched) {
  let length = 0;
  for (let y = ty * size; y < Math.min(h, (ty + 1) * size); y += 2)
    for (let x = tx * size; x < Math.min(w, (tx + 1) * size); x += 2) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const k = key(data[i], data[i + 1], data[i + 2]);
      if (!counts[k]) touched[length++] = k;
      counts[k]++;
      red[k] += data[i];
      green[k] += data[i + 1];
      blue[k] += data[i + 2];
    }
  let best = -1;
  for (let i = 0; i < length; i++) {
    const k = touched[i];
    if (best < 0 || counts[k] > counts[best]) best = k;
  }
  const background =
    best >= 0
      ? [red[best] / counts[best], green[best] / counts[best], blue[best] / counts[best]]
      : [255, 255, 255];
  for (let i = 0; i < length; i++) {
    const k = touched[i];
    counts[k] = 0;
    red[k] = 0;
    green[k] = 0;
    blue[k] = 0;
  }
  return background;
}

function classifyTileForeground(data, w, h, size, cols, rows, backgrounds, detail) {
  const mask = new Uint8Array(w * h),
    threshold = 100 - detail * 0.8;
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const b = backgrounds[ty * cols + tx];
      if (!b) continue;
      const bottom = Math.min(h, (ty + 1) * size),
        right = Math.min(w, (tx + 1) * size);
      for (let y = ty * size; y < bottom; y++)
        for (let x = tx * size; x < right; x++) {
          const i = y * w + x,
            j = i * 4;
          if (
            data[j + 3] > 128 &&
            Math.max(
              Math.abs(data[j] - b[0]),
              Math.abs(data[j + 1] - b[1]),
              Math.abs(data[j + 2] - b[2])
            ) > threshold
          )
            mask[i] = 1;
        }
    }
  return mask;
}
