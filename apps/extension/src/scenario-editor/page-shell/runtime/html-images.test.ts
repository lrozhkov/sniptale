import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../../features/scenario/project/public';
import { DEFAULT_HTML_IMAGES } from '../html-image-settings';
const io = vi.hoisted(() => ({
  asset: vi.fn(),
  crop: vi.fn(),
  bitmap: vi.fn(),
  encode: vi.fn(),
  close: vi.fn(),
}));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob: io.asset,
}));
vi.mock('./image-frame', () => ({ renderGuideImageFrame: io.crop }));
import { measureHtmlImages, prepareHtmlImage } from './html-images';
const image = () =>
  createGuideImageBlock({
    id: 'a',
    assetId: 'source',
    width: 400,
    height: 200,
    source: { kind: 'import', filename: 'a.png' },
  });
const png = () =>
  new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
beforeEach(() => {
  vi.resetAllMocks();
  io.asset.mockResolvedValue(png());
  io.bitmap.mockResolvedValue({ width: 400, height: 200, close: io.close });
  vi.stubGlobal('createImageBitmap', io.bitmap);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { drawImage: vi.fn() };
      }
      convertToBlob = io.encode;
    }
  );
});
afterEach(() => vi.unstubAllGlobals());
it('keeps original bytes and deduplicates equal rasters despite viewer overrides', async () => {
  const project = createGuideProject('Guide');
  const step = createGuideStep('Step');
  step.blocks = [
    image(),
    { ...image(), id: 'b', htmlExport: { ...DEFAULT_HTML_IMAGES, viewer: false } },
  ];
  project.items = [step];
  const result = await measureHtmlImages(project, new AbortController().signal);
  expect(result.rasters).toHaveLength(1);
  expect(result.blocks).toEqual(
    new Map([
      ['a', 0],
      ['b', 0],
    ])
  );
  expect(io.asset).toHaveBeenCalledTimes(1);
  expect(io.encode).not.toHaveBeenCalled();
  expect(io.close).toHaveBeenCalledTimes(1);
});
it('uses only the rendered crop and declines a larger optimized encoding', async () => {
  const cropped = png();
  io.crop.mockResolvedValue(cropped);
  io.encode.mockResolvedValue(new Blob(['a'.repeat(100)], { type: 'image/webp' }));
  const result = await prepareHtmlImage(
    image(),
    { ...DEFAULT_HTML_IMAGES, content: 'frame', optimize: true },
    new AbortController().signal
  );
  expect(io.bitmap).toHaveBeenCalledWith(cropped);
  expect(result.blob).toBe(cropped);
  expect(io.crop).toHaveBeenCalledTimes(1);
});
it('bounds resized output even when encoding is larger and closes on encode failure', async () => {
  io.bitmap.mockResolvedValue({ width: 10000, height: 5000, close: io.close });
  const encoded = new Blob(['x'.repeat(100)], { type: 'image/webp' });
  io.encode.mockResolvedValueOnce(encoded).mockRejectedValueOnce(new Error('encode'));
  const result = await prepareHtmlImage(
    image(),
    { ...DEFAULT_HTML_IMAGES, optimize: true, maxEdge: 1280 },
    new AbortController().signal
  );
  expect(result).toMatchObject({ width: 1280, height: 640, blob: encoded });
  await expect(
    prepareHtmlImage(
      image(),
      { ...DEFAULT_HTML_IMAGES, optimize: true },
      new AbortController().signal
    )
  ).rejects.toThrow('encode');
  expect(io.close).toHaveBeenCalledTimes(2);
});
it('releases a bitmap returned after cancellation without encoding', async () => {
  const controller = new AbortController();
  io.bitmap.mockImplementation(async () => {
    controller.abort();
    return { width: 400, height: 200, close: io.close };
  });
  await expect(prepareHtmlImage(image(), DEFAULT_HTML_IMAGES, controller.signal)).rejects.toThrow();
  expect(io.close).toHaveBeenCalledOnce();
  expect(io.encode).not.toHaveBeenCalled();
});
