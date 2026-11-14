import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRasterBrushStroke } from './brush';
import { decodePngRgba, encodePngRgba } from '../../platform/media-utils/png-codec';
import * as pngCodec from '../../platform/media-utils/png-codec';
import {
  createEditorRasterMetadata,
  decodeEditorRasterPixels,
  encodeEditorRasterPixels,
  encodeRasterFragment,
  RasterImageResourceLimitError,
} from './image-state';
import {
  composeRasterPixels,
  fillRasterRegion,
  hideRasterRegion,
  paintRasterVisibility,
  type RasterPixelData,
} from './pixels';

async function png(rgba: readonly number[], width = rgba.length / 4): Promise<string> {
  const blob = await encodePngRgba({
    width,
    height: rgba.length / 4 / width,
    rgba: new Uint8ClampedArray(rgba),
  });
  return `data:image/png;base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
}

async function raw(source: string, width: number, height = 1) {
  const blob = await fetch(source).then((response) => response.blob());
  return decodePngRgba({ bytes: new Uint8Array(await blob.arrayBuffer()), width, height });
}

afterEach(() => vi.restoreAllMocks());

describe('retained raster byte adaptation', () => {
  it('keeps hidden original bytes private to retained state and clears them in visible output', async () => {
    const original = await png([70, 80, 90, 0, 11, 22, 33, 255]);
    const metadata = createEditorRasterMetadata(original, 2, 1);
    const pixels = await decodeEditorRasterPixels(metadata);
    const result = await encodeEditorRasterPixels(metadata, pixels, pixels);
    expect(result.metadata.sniptaleRasterOriginalData).toBe(original);
    expect([...pixels.color]).toEqual([70, 80, 90, 0, 11, 22, 33, 255]);
    expect([...(await raw(result.visibleFullDataUrl, 2))]).toEqual([0, 0, 0, 0, 11, 22, 33, 255]);
  });
  it('preserves original, color, visibility, low-strength key and source crop through encoding', async () => {
    const original = await png([30, 70, 90, 255, 10, 20, 30, 127]);
    const metadata = createEditorRasterMetadata(original, 2, 1, {
      x: 1,
      y: 0,
      width: 1,
      height: 1,
    });
    const before = await decodeEditorRasterPixels(metadata);
    const after: RasterPixelData = {
      ...before,
      color: new Uint8ClampedArray([40, 80, 100, 255, 10, 20, 30, 127]),
      visibility: new Uint8Array([128, 255]),
      key: new Uint8ClampedArray([220, 240, 250, 1, 50, 120, 190, 5]),
    };
    const snapshot = structuredClone({ metadata, before, after });
    const encoded = await encodeEditorRasterPixels(metadata, before, after);
    expect(encoded.metadata.sniptaleRasterOriginalData).toBe(original);
    expect(encoded.metadata.sniptaleRasterState.crop).toEqual({ x: 1, y: 0, width: 1, height: 1 });
    const reopened = await decodeEditorRasterPixels(encoded.metadata);
    expect(reopened).toEqual(after);
    expect([...(await raw(encoded.metadata.sniptaleRasterKeyData!, 2))]).toEqual([...after.key!]);
    expect({ metadata, before, after }).toEqual(snapshot);
    expect(encoded.metadata.sniptaleRasterState).not.toBe(metadata.sniptaleRasterState);
  });

  it('reuses unchanged color resources and restores erased visibility without undoing fill', async () => {
    const original = await png([90, 60, 30, 255, 10, 30, 50, 255]);
    const metadata = createEditorRasterMetadata(original, 2, 1);
    const initial = await decodeEditorRasterPixels(metadata);
    const unchanged = await encodeEditorRasterPixels(metadata, initial, initial);
    expect(unchanged.visibleFullDataUrl).toBe(original);
    expect(unchanged.metadata.sniptaleRasterColorData).toBeUndefined();
    const region = new Uint8Array([255, 0]);
    const filled = fillRasterRegion(initial, region, [150, 110, 70, 255]);
    const first = await encodeEditorRasterPixels(metadata, initial, filled);
    const erased = hideRasterRegion(filled, region);
    const second = await encodeEditorRasterPixels(first.metadata, filled, erased);
    expect(second.metadata.sniptaleRasterColorData).toBe(first.metadata.sniptaleRasterColorData);
    expect([...(await raw(second.visibleFullDataUrl, 2))]).toEqual([0, 0, 0, 0, 10, 30, 50, 255]);
    const reopened = await decodeEditorRasterPixels(second.metadata);
    const restored = paintRasterVisibility(reopened, region, true);
    const third = await encodeEditorRasterPixels(second.metadata, reopened, restored);
    expect(third.metadata.sniptaleRasterVisibilityData).toBeUndefined();
    expect(third.metadata.sniptaleRasterOriginalData).toBe(original);
    expect([...(await raw(third.visibleFullDataUrl, 2))]).toEqual([
      150, 110, 70, 255, 10, 30, 50, 255,
    ]);
  });

  it('copies exact source pixels and clears RGB outside the explicit selection', async () => {
    const pixels: RasterPixelData = {
      width: 3,
      height: 2,
      color: new Uint8ClampedArray([
        10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255, 130, 140, 150, 255,
        160, 170, 180, 255,
      ]),
      visibility: null,
      key: null,
    };
    const source = structuredClone(pixels);
    const result = await encodeRasterFragment(
      pixels,
      { x: 1, y: 0, width: 2, height: 2 },
      new Uint8Array([0, 255, 0, 0, 0, 255])
    );
    expect([...(await raw(result, 2, 2))]).toEqual([
      40, 50, 60, 255, 0, 0, 0, 0, 0, 0, 0, 0, 160, 170, 180, 255,
    ]);
    const empty = await encodeRasterFragment(
      pixels,
      { x: 0, y: 0, width: 3, height: 2 },
      new Uint8Array(6)
    );
    expect([...(await raw(empty, 3, 2))]).toEqual(new Array(24).fill(0));
    expect(pixels).toEqual(source);
  });

  it('refuses partial metadata, remote resources and bad crop before fetching', async () => {
    const resource = await png([1, 2, 3, 255]);
    const metadata = createEditorRasterMetadata(resource, 1, 1);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      decodeEditorRasterPixels({ sniptaleRasterOriginalData: resource })
    ).rejects.toThrow('Invalid retained raster state');
    await expect(
      decodeEditorRasterPixels({
        ...metadata,
        sniptaleRasterOriginalData: 'https://example.com/image.png',
      })
    ).rejects.toThrow('Invalid retained raster state');
    expect(() =>
      createEditorRasterMetadata(resource, 1, 1, { x: 1, y: 0, width: 1, height: 1 })
    ).toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects masks with wrong dimensions or visibility channels and keeps all source bytes', async () => {
    const resource = await png([11, 22, 33, 255]);
    const metadata = createEditorRasterMetadata(resource, 1, 1);
    const badVisibility = await png([100, 101, 100, 255]);
    await expect(
      decodeEditorRasterPixels({ ...metadata, sniptaleRasterVisibilityData: badVisibility })
    ).rejects.toThrow('opaque grayscale');
    const badAlpha = await png([100, 100, 100, 127]);
    await expect(
      decodeEditorRasterPixels({ ...metadata, sniptaleRasterVisibilityData: badAlpha })
    ).rejects.toThrow('opaque grayscale');
    const wrongSize = await png([255, 255, 255, 255, 255, 255, 255, 255]);
    await expect(
      decodeEditorRasterPixels({ ...metadata, sniptaleRasterKeyData: wrongSize })
    ).rejects.toThrow();
    expect(metadata).toEqual(createEditorRasterMetadata(resource, 1, 1));
  });

  it('cancels before resource work and refuses encoding incompatible planes', async () => {
    const resource = await png([11, 22, 33, 255]);
    const metadata = createEditorRasterMetadata(resource, 1, 1);
    const before = await decodeEditorRasterPixels(metadata);
    const controller = new AbortController();
    controller.abort(new Error('cancelled-raster-candidate'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(decodeEditorRasterPixels(metadata, controller.signal)).rejects.toThrow(
      'cancelled-raster-candidate'
    );
    await expect(
      encodeEditorRasterPixels(metadata, before, before, controller.signal)
    ).rejects.toThrow('cancelled-raster-candidate');
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(
      encodeEditorRasterPixels(metadata, before, { ...before, width: 2 })
    ).rejects.toThrow();
    await expect(
      encodeRasterFragment(before, { x: 0, y: 0, width: 2, height: 1 })
    ).rejects.toThrow();
    expect([...before.color]).toEqual([11, 22, 33, 255]);
  });

  it('refuses an oversized encoded candidate before any accepted resource changes', async () => {
    const resource = await png([11, 22, 33, 255]);
    const metadata = createEditorRasterMetadata(resource, 1, 1);
    const before = await decodeEditorRasterPixels(metadata);
    const after = fillRasterRegion(before, new Uint8Array([255]), [90, 100, 110, 255]);
    const snapshot = structuredClone({ metadata, before, after });
    vi.spyOn(pngCodec, 'encodePngRgba').mockResolvedValueOnce(
      new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: 'image/png' })
    );
    await expect(encodeEditorRasterPixels(metadata, before, after)).rejects.toBeInstanceOf(
      RasterImageResourceLimitError
    );
    expect({ metadata, before, after }).toEqual(snapshot);
  });
});

it('round-trips painted alpha and color through the existing retained raster format', async () => {
  const original = await png([255, 255, 255, 255, 20, 40, 60, 0, 0, 0, 0, 255]);
  const metadata = createEditorRasterMetadata(original, 3, 1);
  const before = await decodeEditorRasterPixels(metadata);
  const stroke = createRasterBrushStroke({
    planes: before,
    geometry: {
      width: 3,
      height: 1,
      crop: { x: 0, y: 0, width: 3, height: 1 },
      sourceToScene: [1, 0, 0, 1, 0, 0],
      periodic: false,
    },
    diameter: 4,
    hardness: 1,
    mode: 'paint',
    color: [255, 0, 0, 255],
    opacity: 0.5,
  });
  const after = stroke.finish({ x: 1.5, y: 0.5 }).planes;
  const encoded = await encodeEditorRasterPixels(metadata, before, after);
  const reopened = await decodeEditorRasterPixels(encoded.metadata);
  expect(encoded.metadata.sniptaleRasterOriginalData).toBe(original);
  expect([...composeRasterPixels(reopened)]).toEqual([
    255, 128, 128, 255, 255, 0, 0, 128, 128, 0, 0, 255,
  ]);
  expect(composeRasterPixels(reopened)).toEqual(composeRasterPixels(after));
});
