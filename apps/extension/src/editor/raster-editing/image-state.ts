import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import {
  parseEditorRasterMetadata,
  type EditorRasterMetadata,
  type EditorRasterState,
} from '../../features/editor/document/raster-state';
import { decodePngRgba, encodePngRgba } from '../../platform/media-utils/png-codec';
import {
  assertRasterSize,
  assertSelectionMask,
  type PixelBounds,
  type SelectionMask,
} from './contracts';
import {
  assertRasterPixelData,
  composeRasterPixels,
  composeRasterRegion,
  type RasterPixelData,
} from './pixels';

/** The encoded candidate cannot enter the existing editor image-resource profile. */
export class RasterImageResourceLimitError extends Error {
  override name = 'RasterImageResourceLimitError';

  constructor() {
    super('Raster result exceeds the supported image resource profile');
  }
}

function checkedMetadata(value: unknown): EditorRasterMetadata {
  const parsed = parseEditorRasterMetadata(
    value,
    (source, kind): source is string =>
      isImageDataUrl(source) && (kind === 'image' || source.startsWith('data:image/png;'))
  );
  if (!parsed) throw new Error('Invalid retained raster state');
  return parsed;
}

async function imageBlob(source: string, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  // All callers admit data URLs first. No network or object URL is accepted here.
  const response = await fetch(source, signal ? { signal } : undefined);
  if (!response.ok) throw new Error('Raster resource is unavailable');
  return response.blob();
}

async function imageDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  // Each complete block contains a multiple of three bytes, so padding occurs only at the end.
  for (let offset = 0; offset < bytes.length; offset += 49_152) {
    signal?.throwIfAborted();
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 49_152))));
  }
  signal?.throwIfAborted();
  const source = `data:image/png;base64,${chunks.join('')}`;
  if (!isImageDataUrl(source)) throw new RasterImageResourceLimitError();
  return source;
}

async function encodeBytes(
  size: { width: number; height: number },
  rgba: Uint8ClampedArray,
  signal?: AbortSignal
): Promise<string> {
  const blob = await encodePngRgba({ ...size, rgba, ...(signal ? { signal } : {}) });
  return imageDataUrl(blob, signal);
}

async function browserPixels(
  blob: Blob,
  size: { width: number; height: number },
  signal?: AbortSignal
): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(blob);
  try {
    signal?.throwIfAborted();
    if (bitmap.width !== size.width || bitmap.height !== size.height)
      throw new Error('Raster resource dimensions do not match its retained state');
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Raster pixel context is unavailable');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, size.width, size.height).data;
  } finally {
    bitmap.close();
  }
}

async function colorPixels(
  source: string,
  size: { width: number; height: number },
  signal?: AbortSignal
): Promise<Uint8ClampedArray> {
  const blob = await imageBlob(source, signal);
  if (blob.type === 'image/png') {
    try {
      return await decodePngRgba({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        ...size,
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      signal?.throwIfAborted();
      // Other admitted image profiles retain the browser's existing color conversion.
      if (typeof createImageBitmap !== 'function') throw error;
    }
  }
  return browserPixels(blob, size, signal);
}

async function maskPixels(
  source: string,
  size: { width: number; height: number },
  signal?: AbortSignal
): Promise<Uint8ClampedArray> {
  const blob = await imageBlob(source, signal);
  return decodePngRgba({
    bytes: new Uint8Array(await blob.arrayBuffer()),
    ...size,
    ...(signal ? { signal } : {}),
  });
}

/** Create the first retained state without changing the source or publishing a document. */
export function createEditorRasterMetadata(
  source: string,
  width: number,
  height: number,
  crop: EditorRasterState['crop'] = { x: 0, y: 0, width, height }
): EditorRasterMetadata {
  assertRasterSize({ width, height });
  return checkedMetadata({
    sniptaleRasterState: { version: 1, width, height, crop },
    sniptaleRasterOriginalData: source,
  });
}

/** Decode accepted planes. Key bytes bypass Canvas alpha premultiplication. */
export async function decodeEditorRasterPixels(
  metadata: unknown,
  signal?: AbortSignal
): Promise<RasterPixelData> {
  const state = checkedMetadata(metadata);
  const size = state.sniptaleRasterState;
  const count = assertRasterSize(size);
  signal?.throwIfAborted();
  if (
    state.sniptaleRasterColorData &&
    state.sniptaleRasterColorData !== state.sniptaleRasterOriginalData
  ) {
    // A retained original must also have the declared source dimensions.
    await colorPixels(state.sniptaleRasterOriginalData, size, signal);
  }
  const color = await colorPixels(
    state.sniptaleRasterColorData ?? state.sniptaleRasterOriginalData,
    size,
    signal
  );
  let visibility: Uint8Array | null = null;
  if (state.sniptaleRasterVisibilityData) {
    const rgba = await maskPixels(state.sniptaleRasterVisibilityData, size, signal);
    visibility = new Uint8Array(count);
    for (let index = 0; index < count; index++) {
      const offset = index * 4;
      const value = rgba[offset]!;
      if (value !== rgba[offset + 1] || value !== rgba[offset + 2] || rgba[offset + 3] !== 255)
        throw new Error('Raster visibility must be an opaque grayscale PNG');
      visibility[index] = value;
    }
  }
  const key = state.sniptaleRasterKeyData
    ? await maskPixels(state.sniptaleRasterKeyData, size, signal)
    : null;
  signal?.throwIfAborted();
  return { width: size.width, height: size.height, color, visibility, key };
}

function hasKey(key: Uint8ClampedArray | null): boolean {
  if (!key) return false;
  for (let offset = 3; offset < key.length; offset += 4) if (key[offset]) return true;
  return false;
}

function hasHiddenColor(color: Uint8ClampedArray): boolean {
  for (let offset = 0; offset < color.length; offset += 4) {
    if (color[offset + 3] === 0 && (color[offset] || color[offset + 1] || color[offset + 2]))
      return true;
  }
  return false;
}

function checkPlaneSize(metadata: EditorRasterMetadata, planes: RasterPixelData): void {
  assertRasterPixelData(planes);
  if (
    planes.width !== metadata.sniptaleRasterState.width ||
    planes.height !== metadata.sniptaleRasterState.height
  )
    throw new Error('Raster planes do not match the retained source dimensions');
}

/** Encode a candidate; unchanged plane references reuse their existing immutable resources. */
export async function encodeEditorRasterPixels(
  metadata: unknown,
  before: RasterPixelData,
  after: RasterPixelData,
  signal?: AbortSignal
): Promise<{ metadata: EditorRasterMetadata; visibleFullDataUrl: string }> {
  const state = checkedMetadata(metadata);
  checkPlaneSize(state, before);
  checkPlaneSize(state, after);
  signal?.throwIfAborted();
  const color =
    after.color === before.color
      ? state.sniptaleRasterColorData
      : await encodeBytes(after, after.color, signal);
  let visibility = state.sniptaleRasterVisibilityData;
  if (after.visibility !== before.visibility) {
    visibility = undefined;
    if (after.visibility && !after.visibility.every((value) => value === 255)) {
      const rgba = new Uint8ClampedArray(after.width * after.height * 4);
      for (let index = 0; index < after.visibility.length; index++) {
        rgba.fill(after.visibility[index]!, index * 4, index * 4 + 3);
        rgba[index * 4 + 3] = 255;
      }
      visibility = await encodeBytes(after, rgba, signal);
    }
  }
  let key = state.sniptaleRasterKeyData;
  if (after.key !== before.key)
    key = hasKey(after.key) && after.key ? await encodeBytes(after, after.key, signal) : undefined;
  const next: EditorRasterMetadata = {
    sniptaleRasterState: state.sniptaleRasterState,
    sniptaleRasterOriginalData: state.sniptaleRasterOriginalData,
    ...(color ? { sniptaleRasterColorData: color } : {}),
    ...(visibility ? { sniptaleRasterVisibilityData: visibility } : {}),
    ...(key ? { sniptaleRasterKeyData: key } : {}),
  };
  const visibleFullDataUrl =
    (!after.visibility || after.visibility.every((value) => value === 255)) &&
    !hasKey(after.key) &&
    !hasHiddenColor(after.color)
      ? (color ?? state.sniptaleRasterOriginalData)
      : await encodeBytes(after, composeRasterPixels(after), signal);
  signal?.throwIfAborted();
  return { metadata: checkedMetadata(next), visibleFullDataUrl };
}

/** Encode a source-coordinate fragment; unselected and hidden pixels contain no source RGB. */
export async function encodeRasterFragment(
  pixels: RasterPixelData,
  crop: PixelBounds,
  selection: SelectionMask = null,
  signal?: AbortSignal
): Promise<string> {
  assertRasterPixelData(pixels);
  assertSelectionMask(selection, pixels.width * pixels.height);
  if (
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > pixels.width ||
    crop.y + crop.height > pixels.height
  )
    throw new RangeError('Raster fragment must be inside the source');
  signal?.throwIfAborted();
  const rgba = composeRasterRegion(pixels, crop);
  for (let y = 0; y < crop.height; y++) {
    signal?.throwIfAborted();
    for (let x = 0; x < crop.width; x++) {
      const source = (crop.y + y) * pixels.width + crop.x + x;
      if (selection && !selection[source]) {
        const offset = (y * crop.width + x) * 4;
        rgba.fill(0, offset, offset + 4);
      }
    }
  }
  return encodeBytes(crop, rgba, signal);
}
