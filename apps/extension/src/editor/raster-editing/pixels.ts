import {
  assertRasterSize,
  assertSelectionMask,
  type RasterSize,
  type PixelBounds,
  type SelectionMask,
} from './contracts';

/** Accepted source-sized planes. Null visibility means 255; null key means strength zero. */
export interface RasterPixelData extends RasterSize {
  readonly color: Uint8ClampedArray;
  readonly visibility: Uint8Array | null;
  readonly key: Uint8ClampedArray | null;
}

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

/** Reject invalid source dimensions and plane lengths before allocation or mutation. */
export function assertRasterPixelData(planes: RasterPixelData): void {
  const count = assertRasterSize(planes);
  if (!(planes.color instanceof Uint8ClampedArray) || planes.color.length !== count * 4)
    throw new TypeError('Color must contain four bytes per source pixel');
  if (
    planes.visibility !== null &&
    (!(planes.visibility instanceof Uint8Array) || planes.visibility.length !== count)
  )
    throw new TypeError('Visibility must contain one byte per source pixel');
  if (
    planes.key !== null &&
    (!(planes.key instanceof Uint8ClampedArray) || planes.key.length !== count * 4)
  )
    throw new TypeError('Key must contain four bytes per source pixel');
}

function assertChannels(channels: Rgb | Rgba, length: number): void {
  if (channels.length !== length || channels.some((v) => !Number.isInteger(v) || v < 0 || v > 255))
    throw new RangeError('Color channels must be integer bytes');
}

function minimumAlpha(color: Uint8ClampedArray, p: number, key: Rgb): number {
  let q = 0;
  for (let c = 0; c < 3; c++) {
    const value = color[p + c]!;
    const backing = key[c]!;
    q = Math.max(
      q,
      value < backing
        ? (backing - value) / backing
        : value > backing
          ? (value - backing) / (255 - backing)
          : 0
    );
  }
  return q;
}

function composePixel(
  planes: RasterPixelData,
  sourceIndex: number,
  result: Uint8ClampedArray,
  target: number
): void {
  const p = sourceIndex * 4;
  const strength = planes.key?.[p + 3] ?? 0;
  let q = 1;
  const key = planes.key;
  if (strength > 0 && key !== null) {
    const rgb: Rgb = [key[p]!, key[p + 1]!, key[p + 2]!];
    q = 1 - (strength / 255) * (1 - minimumAlpha(planes.color, p, rgb));
    for (let c = 0; c < 3; c++)
      result[target + c] = q > 0 ? (planes.color[p + c]! - (1 - q) * rgb[c]!) / q : 0;
  } else for (let c = 0; c < 3; c++) result[target + c] = planes.color[p + c]!;
  result[target + 3] = (planes.color[p + 3]! * q * (planes.visibility?.[sourceIndex] ?? 255)) / 255;
  if (result[target + 3] === 0) result.fill(0, target, target + 3);
}

/** Blend paint over the accepted visible pixel into a detached color plane. The stroke validates its inputs. */
export function paintRasterColorPixel(
  planes: RasterPixelData,
  index: number,
  result: Uint8ClampedArray,
  color: Rgba,
  coverage: number
): void {
  const p = index * 4;
  composePixel(planes, index, result, p);
  const sourceAlpha = (color[3] / 255) * coverage;
  const destinationAlpha = result[p + 3]! / 255;
  const alpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  for (let c = 0; c < 3; c++)
    result[p + c] =
      alpha > 0
        ? (color[c]! * sourceAlpha + result[p + c]! * destinationAlpha * (1 - sourceAlpha)) / alpha
        : 0;
  result[p + 3] = alpha * 255;
}

/** Compose independent RGBA bytes; base color, source alpha and visibility remain authoritative. */
export function composeRasterPixels(planes: RasterPixelData): Uint8ClampedArray {
  if (planes.visibility === null && planes.key === null) {
    assertRasterPixelData(planes);
    const result = planes.color.slice();
    for (let p = 3; p < result.length; p += 4) if (result[p] === 0) result.fill(0, p - 3, p);
    return result;
  }
  return composeRasterRegion(planes, { x: 0, y: 0, width: planes.width, height: planes.height });
}

/**
 * Compose a packed source window with the same math as full-image composition.
 * Bounds use integer source pixels and positive admitted dimensions. Out-of-image cells are zero.
 * Allocation and traversal are bounded by the requested window, without a full-image temporary.
 */
export function composeRasterRegion(
  planes: RasterPixelData,
  bounds: PixelBounds
): Uint8ClampedArray {
  assertRasterPixelData(planes);
  const count = assertRasterSize(bounds);
  if (
    !Number.isSafeInteger(bounds.x) ||
    !Number.isSafeInteger(bounds.y) ||
    !Number.isSafeInteger(bounds.x + bounds.width) ||
    !Number.isSafeInteger(bounds.y + bounds.height)
  )
    throw new RangeError('Raster window coordinates must be safe integer source pixels');
  const result = new Uint8ClampedArray(count * 4);
  const left = Math.max(0, -bounds.x);
  const right = Math.min(bounds.width, planes.width - bounds.x);
  const top = Math.max(0, -bounds.y);
  const bottom = Math.min(bounds.height, planes.height - bounds.y);
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++)
      composePixel(
        planes,
        (bounds.y + y) * planes.width + bounds.x + x,
        result,
        (y * bounds.width + x) * 4
      );
  return result;
}

/** Replace region RGBA and reset its visibility and key strength; preserve every other pixel. */
export function fillRasterRegion(
  planes: RasterPixelData,
  region: Uint8Array,
  color: Rgba
): RasterPixelData {
  assertRasterPixelData(planes);
  const count = planes.width * planes.height;
  if (!(region instanceof Uint8Array)) throw new TypeError('Region must be a binary byte mask');
  assertSelectionMask(region, count);
  assertChannels(color, 4);
  let nextColor = planes.color;
  let visibility = planes.visibility;
  let key = planes.key;
  for (let i = 0; i < count; i++) {
    if (!region[i]) continue;
    const p = i * 4;
    if (color.some((v, c) => planes.color[p + c] !== v)) {
      if (nextColor === planes.color) nextColor = planes.color.slice();
      nextColor.set(color, p);
    }
    if (visibility !== null && visibility[i] !== 255) {
      if (visibility === planes.visibility) visibility = visibility.slice();
      visibility[i] = 255;
    }
    if (key !== null && key[p + 3] !== 0) {
      if (key === planes.key) key = key.slice();
      key[p + 3] = 0;
    }
  }
  return nextColor === planes.color && visibility === planes.visibility && key === planes.key
    ? planes
    : { ...planes, color: nextColor, visibility, key };
}

/** Hide a binary region without changing accepted color or removal keys. */
export function hideRasterRegion(planes: RasterPixelData, region: Uint8Array): RasterPixelData {
  assertRasterPixelData(planes);
  const count = planes.width * planes.height;
  if (!(region instanceof Uint8Array)) throw new TypeError('Region must be a binary byte mask');
  assertSelectionMask(region, count);
  return paintRasterVisibility(planes, region, false);
}

/** Apply soft coverage by source-over erasure/restoration. Restoration also reduces key strength. */
export function paintRasterVisibility(
  planes: RasterPixelData,
  coverage: Uint8Array,
  restore: boolean
): RasterPixelData {
  assertRasterPixelData(planes);
  const count = planes.width * planes.height;
  if (!(coverage instanceof Uint8Array) || coverage.length !== count)
    throw new TypeError('Coverage must contain one byte per source pixel');
  if (typeof restore !== 'boolean') throw new TypeError('Restore must be boolean');
  let visibility = planes.visibility;
  let key = planes.key;
  for (let i = 0; i < count; i++) {
    if (!coverage[i]) continue;
    const fraction = coverage[i]! / 255;
    const old = planes.visibility?.[i] ?? 255;
    const value = Math.round(restore ? old + (255 - old) * fraction : old * (1 - fraction));
    if (value !== old) {
      if (visibility === planes.visibility)
        visibility = planes.visibility?.slice() ?? new Uint8Array(count).fill(255);
      visibility![i] = value;
    }
    const p = i * 4 + 3;
    if (restore && key !== null) {
      const value = Math.round(key[p]! * (1 - fraction));
      if (value !== key[p]) {
        if (key === planes.key) key = key.slice();
        key[p] = value;
      }
    }
  }
  return visibility === planes.visibility && key === planes.key
    ? planes
    : { ...planes, visibility, key };
}

function hasRegionNeighbor(
  planes: RasterSize,
  region: Uint8Array,
  selection: SelectionMask,
  x: number,
  y: number
): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    if (y + dy < 0 || y + dy >= planes.height) continue;
    for (let dx = -2; dx <= 2; dx++) {
      if (x + dx < 0 || x + dx >= planes.width) continue;
      const i = (y + dy) * planes.width + x + dx;
      if (region[i] && (selection === null || selection[i])) return true;
    }
  }
  return false;
}

function hasRepeatedLine(
  planes: RasterPixelData,
  region: Uint8Array,
  x: number,
  y: number,
  rgb: Uint8ClampedArray
): boolean {
  for (const vertical of [false, true])
    for (let across = -3; across <= 3; across++) {
      let run = 0;
      for (let along = -3; along <= 3; along++) {
        const nx = x + (vertical ? across : along);
        const ny = y + (vertical ? along : across);
        if (nx < 0 || nx >= planes.width || ny < 0 || ny >= planes.height) {
          run = 0;
          continue;
        }
        const i = ny * planes.width + nx;
        const p = i * 4;
        const beforeX = nx - (vertical ? 1 : 0);
        const afterX = nx + (vertical ? 1 : 0);
        const beforeY = ny - (vertical ? 0 : 1);
        const afterY = ny + (vertical ? 0 : 1);
        const before = beforeX < 0 || beforeY < 0 || region[beforeY * planes.width + beforeX];
        const after =
          afterX >= planes.width ||
          afterY >= planes.height ||
          region[afterY * planes.width + afterX];
        if (
          before &&
          after &&
          !region[i] &&
          planes.color[p + 3] === 255 &&
          rgb.every((v, c) => v === planes.color[p + c])
        )
          run++;
        else run = 0;
        if (run >= 4) return true;
      }
    }
  return false;
}

function removalStrength(
  planes: RasterPixelData,
  p: number,
  x: number,
  y: number,
  key: Rgb,
  region: Uint8Array
): number {
  const qmin = minimumAlpha(planes.color, p, key);
  if (qmin === 1) return 0;
  let anchor = p;
  let contrast = qmin;
  const observations = new Map<number, number>();
  for (let dy = -3; dy <= 3; dy++) {
    if (y + dy < 0 || y + dy >= planes.height) continue;
    for (let dx = -3; dx <= 3; dx++) {
      if (x + dx < 0 || x + dx >= planes.width) continue;
      const n = ((y + dy) * planes.width + x + dx) * 4;
      if (planes.color[n + 3] !== 255) continue;
      const q = minimumAlpha(planes.color, n, key);
      if (q > contrast) {
        contrast = q;
        anchor = n;
      }
      const rgb = planes.color[n]! * 65536 + planes.color[n + 1]! * 256 + planes.color[n + 2]!;
      const entry = observations.get(rgb);
      if (!region[n / 4]) {
        observations.set(rgb, (entry ?? 0) + 1);
      }
    }
  }
  const rgb = planes.color.slice(anchor, anchor + 3);
  const repeated = observations.get(rgb[0]! * 65536 + rgb[1]! * 256 + rgb[2]!) ?? 0;
  // Preserve observed one-pixel gray lines; small gray plateaus remain ambiguous black antialiasing.
  const grayscale = Math.max(...rgb) === Math.min(...rgb);
  if (grayscale ? !hasRepeatedLine(planes, region, x, y, rgb) : contrast < 0.5) return 255;
  let dot = 0;
  let norm = 0;
  for (let c = 0; c < 3; c++) {
    const delta = planes.color[anchor + c]! - key[c]!;
    dot += (planes.color[p + c]! - key[c]!) * delta;
    norm += delta * delta;
  }
  const q = Math.max(qmin, Math.min(1, norm > 0 ? dot / norm : qmin));
  const residual = Math.max(
    ...[0, 1, 2].map((c) =>
      Math.abs(planes.color[p + c]! - (key[c]! + q * (planes.color[anchor + c]! - key[c]!)))
    )
  );
  // RGB ray mismatch can reflect JPEG chroma loss; use its source luma rather than amplify that loss.
  if (residual > 2) {
    let sourceLuma = 0;
    let anchorLuma = 0;
    for (let c = 0; c < 3; c++) {
      const weight = [0.299, 0.587, 0.114][c]!;
      sourceLuma += (key[c]! - planes.color[p + c]!) * weight;
      anchorLuma += (key[c]! - planes.color[anchor + c]!) * weight;
    }
    if (anchorLuma > 0) {
      const lumaAlpha = Math.max(qmin, Math.min(1, sourceLuma / anchorLuma));
      return Math.round((255 * (1 - lumaAlpha)) / (1 - qmin));
    }
  }
  if (repeated < 3) return 255;
  return Math.round((255 * (1 - q)) / (1 - qmin));
}

/**
 * Remove a key using an existing search region and a separately selection-clipped two-pixel band.
 * The local repeated chromatic anchor is bounded source evidence, not general foreground inference.
 * Nonopaque source edges retain their existing RGBA; exact selected key colors can still be removed.
 */
export function removeRasterColor(
  planes: RasterPixelData,
  region: Uint8Array,
  color: Rgb,
  selection: SelectionMask = null
): RasterPixelData {
  assertRasterPixelData(planes);
  const count = planes.width * planes.height;
  if (!(region instanceof Uint8Array)) throw new TypeError('Region must be a binary byte mask');
  assertSelectionMask(region, count);
  assertSelectionMask(selection, count);
  assertChannels(color, 3);
  let key = planes.key;
  for (let i = 0; i < count; i++) {
    if (selection !== null && !selection[i]) continue;
    const p = i * 4;
    if (planes.color[p + 3] === 0) continue;
    const x = i % planes.width;
    const y = Math.floor(i / planes.width);
    if (!hasRegionNeighbor(planes, region, selection, x, y)) continue;
    const exactKey = color.every((v, c) => planes.color[p + c] === v);
    if (planes.color[p + 3] !== 255 && !(region[i] && exactKey)) continue;
    if (exactKey && !region[i]) continue;
    const strength = exactKey ? 255 : removalStrength(planes, p, x, y, color, region);
    if (strength === 0) continue;
    if (key !== null && key[p + 3] === strength && color.every((v, c) => key![p + c] === v))
      continue;
    if (key === planes.key) key = planes.key?.slice() ?? new Uint8ClampedArray(count * 4);
    key!.set(color, p);
    key![p + 3] = strength;
  }
  return key === planes.key ? planes : { ...planes, key };
}
