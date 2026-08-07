// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,YmFzZQ=='),
  installFont: vi.fn(async () => undefined),
  toCanvas: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));
vi.mock('@zumer/snapdom', () => ({ snapdom: { toCanvas: mocks.toCanvas } }));
vi.mock('../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/data-url')>()),
  blobToDataUrl: mocks.blobToDataUrl,
}));
vi.mock(
  '../../features/highlighter/frame-annotation/callout/font-installer',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../features/highlighter/frame-annotation/callout/font-installer')
    >()),
    installFrameCalloutHandwrittenFont: mocks.installFont,
  })
);
import {
  resolveAllocationRetryScale,
  resolveFrameAnnotationInitialScale,
  resolveOutputScale,
  resolveOversizeRetryScale,
  FrameAnnotationRasterizer,
} from '.';
import { createDefaultFrameCallout } from '../../features/highlighter/frame-annotation/defaults';
import { createFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation';

beforeEach(() => {
  mocks.blobToDataUrl.mockReset();
  mocks.blobToDataUrl.mockResolvedValue('data:image/png;base64,YmFzZQ==');
  mocks.toCanvas.mockReset();
  mocks.installFont.mockClear();
  vi.stubGlobal('requestAnimationFrame', () => {
    throw new Error('requestAnimationFrame is suspended in chrome.offscreen');
  });
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

function canvasWithBlob(blob: Blob) {
  return {
    toBlob: (callback: BlobCallback) => callback(blob),
  } as HTMLCanvasElement;
}

it('caps output to 16 MP and 16,384 pixels per side while preserving aspect ratio', () => {
  expect(resolveOutputScale(4_000, 4_000)).toBe(1);
  expect(resolveOutputScale(8_000, 4_000)).toBeCloseTo(Math.sqrt(0.5));
  expect(resolveOutputScale(32_768, 1_000)).toBe(0.5);
});

it('applies requested dimensions before the output resource cap', () => {
  expect(
    resolveFrameAnnotationInitialScale({
      width: 1_000,
      height: 500,
      requestedWidth: 2_000,
      requestedHeight: 1_000,
    })
  ).toEqual({ initialScale: 2, requestedScale: 2 });
  expect(
    resolveFrameAnnotationInitialScale({
      width: 8_000,
      height: 4_000,
      requestedWidth: 16_000,
      requestedHeight: 8_000,
    }).initialScale
  ).toBeCloseTo(Math.sqrt(0.5));
});

it('uses one half-area allocation retry and targets 60 MiB for oversized PNG output', () => {
  expect(resolveAllocationRetryScale(1)).toBeCloseTo(Math.SQRT1_2);
  expect(resolveOversizeRetryScale(1, 240 * 1024 * 1024)).toBeCloseTo(0.5);
});

it('rasterizes through SnapDOM with the bounded offscreen options and cleans its host', async () => {
  mocks.toCanvas.mockResolvedValue(canvasWithBlob(new Blob(['output'], { type: 'image/png' })));
  const before = document.body.childElementCount;
  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob(['base'], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).resolves.toMatchObject({ metadata: { downscaled: false, outputWidth: 100, outputHeight: 50 } });
  expect(mocks.toCanvas).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({
      compress: false,
      dpr: 1,
      embedFonts: true,
      localFonts: expect.arrayContaining([
        expect.objectContaining({
          family: 'Sniptale Handwritten',
          src: 'chrome-extension://test/fonts/marck-script-cyrillic-400-normal.woff2',
        }),
        expect.objectContaining({
          family: 'Sniptale Handwritten',
          src: 'chrome-extension://test/fonts/marck-script-latin-400-normal.woff2',
        }),
      ]),
    })
  );
  expect(document.body.childElementCount).toBe(before);
});

it('retries once after allocation failure and once for an oversized first result', async () => {
  const sizedBlob = new Blob([], { type: 'image/png' });
  Object.defineProperty(sizedBlob, 'size', { value: 65 * 1024 * 1024 });
  mocks.toCanvas
    .mockRejectedValueOnce(new Error('allocation'))
    .mockResolvedValueOnce(canvasWithBlob(new Blob(['retry'], { type: 'image/png' })));
  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob([], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).resolves.toMatchObject({ metadata: { downscaled: true } });
  mocks.toCanvas
    .mockReset()
    .mockResolvedValueOnce(canvasWithBlob(sizedBlob))
    .mockResolvedValueOnce(canvasWithBlob(new Blob(['smaller'], { type: 'image/png' })));
  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob([], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).resolves.toMatchObject({ metadata: { downscaled: true } });
  expect(mocks.toCanvas).toHaveBeenCalledTimes(2);
});

it('bounds a stalled SnapDOM attempt without retrying or leaking its host', async () => {
  vi.useFakeTimers();
  try {
    mocks.toCanvas.mockImplementation(() => new Promise(() => undefined));
    const before = document.body.childElementCount;
    const raster = new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob([], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    });

    await vi.waitFor(() => expect(mocks.toCanvas).toHaveBeenCalledOnce());
    const timeoutExpectation = expect(raster).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(50_000);

    await timeoutExpectation;
    expect(mocks.toCanvas).toHaveBeenCalledOnce();
    expect(document.body.childElementCount).toBe(before);
  } finally {
    vi.useRealTimers();
  }
});

it('removes its host when bounded base-image conversion fails', async () => {
  mocks.blobToDataUrl.mockRejectedValueOnce(new Error('base conversion failed'));
  const before = document.body.childElementCount;

  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob([], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).rejects.toThrow('base conversion failed');

  expect(document.body.childElementCount).toBe(before);
  expect(mocks.toCanvas).not.toHaveBeenCalled();
});

it('loads the exact handwritten face after render without awaiting global font readiness', async () => {
  const neverReady = new Promise<FontFaceSet>(() => undefined);
  const load = vi.fn(async () => [{} as FontFace]);
  const check = vi.fn(() => true);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check, load, ready: neverReady },
  });
  mocks.toCanvas.mockResolvedValue(canvasWithBlob(new Blob(['output'], { type: 'image/png' })));
  const callout = createDefaultFrameCallout();
  callout.style.typography.fontFamily = 'cursive';

  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob(['base'], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [
        createFrameAnnotationSnapshot(
          { id: 'frame-1', x: 1, y: 1, width: 20, height: 20, callout },
          0
        ),
      ],
    })
  ).resolves.toMatchObject({ metadata: { downscaled: false } });

  expect(load).toHaveBeenCalledWith(
    '400 16px "Sniptale Handwritten"',
    expect.stringContaining('Бб')
  );
  expect(check).toHaveBeenCalled();
  expect(mocks.toCanvas).toHaveBeenCalledOnce();
});

it('rejects non-PNG input before decoding it in the offscreen document', async () => {
  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob(['svg'], { type: 'image/svg+xml' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).rejects.toThrow('input must be a PNG Blob');
  expect(mocks.toCanvas).not.toHaveBeenCalled();
});

it('rejects a non-PNG SnapDOM blob instead of passing it to clipboard and download flows', async () => {
  mocks.toCanvas.mockResolvedValue(canvasWithBlob(new Blob(['svg'], { type: 'image/svg+xml' })));

  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob([], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).rejects.toThrow('PNG Blob');
  expect(mocks.toCanvas).toHaveBeenCalledOnce();
});
