// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ toBlob: vi.fn() }));
vi.mock('@zumer/snapdom', () => ({ snapdom: { toBlob: mocks.toBlob } }));
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
  mocks.toBlob.mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:base');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

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
  mocks.toBlob.mockResolvedValue(new Blob(['output'], { type: 'image/png' }));
  const before = document.body.childElementCount;
  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob(['base'], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).resolves.toMatchObject({ metadata: { downscaled: false, outputWidth: 100, outputHeight: 50 } });
  expect(mocks.toBlob).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({ dpr: 1, type: 'png', useProxy: '' })
  );
  expect(document.body.childElementCount).toBe(before);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:base');
});

it('retries once after allocation failure and once for an oversized first result', async () => {
  const sizedBlob = new Blob([], { type: 'image/png' });
  Object.defineProperty(sizedBlob, 'size', { value: 65 * 1024 * 1024 });
  mocks.toBlob
    .mockRejectedValueOnce(new Error('allocation'))
    .mockResolvedValueOnce(new Blob(['retry'], { type: 'image/png' }));
  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob([], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).resolves.toMatchObject({ metadata: { downscaled: true } });
  mocks.toBlob
    .mockReset()
    .mockResolvedValueOnce(sizedBlob)
    .mockResolvedValueOnce(new Blob(['smaller'], { type: 'image/png' }));
  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob([], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).resolves.toMatchObject({ metadata: { downscaled: true } });
  expect(mocks.toBlob).toHaveBeenCalledTimes(2);
});

it('bounds a stalled SnapDOM attempt without retrying or leaking its host', async () => {
  vi.useFakeTimers();
  try {
    mocks.toBlob.mockImplementation(() => new Promise(() => undefined));
    const before = document.body.childElementCount;
    const raster = new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob([], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    });

    await vi.waitFor(() => expect(mocks.toBlob).toHaveBeenCalledOnce());
    const timeoutExpectation = expect(raster).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(50_000);

    await timeoutExpectation;
    expect(mocks.toBlob).toHaveBeenCalledOnce();
    expect(document.body.childElementCount).toBe(before);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:base');
  } finally {
    vi.useRealTimers();
  }
});

it('loads the exact handwritten face after render without awaiting global font readiness', async () => {
  const neverReady = new Promise<FontFaceSet>(() => undefined);
  const load = vi.fn(async () => [{} as FontFace]);
  const check = vi.fn(() => true);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check, load, ready: neverReady },
  });
  mocks.toBlob.mockResolvedValue(new Blob(['output'], { type: 'image/png' }));
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
  expect(mocks.toBlob).toHaveBeenCalledOnce();
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
  expect(mocks.toBlob).not.toHaveBeenCalled();
});

it('rejects a non-PNG SnapDOM blob instead of passing it to clipboard and download flows', async () => {
  mocks.toBlob.mockResolvedValue(new Blob(['svg'], { type: 'image/svg+xml' }));

  await expect(
    new FrameAnnotationRasterizer().rasterize({
      baseImage: new Blob([], { type: 'image/png' }),
      width: 100,
      height: 50,
      snapshots: [],
    })
  ).rejects.toThrow('PNG Blob');
  expect(mocks.toBlob).toHaveBeenCalledOnce();
});
