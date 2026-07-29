import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bitmaps: [] as Array<{ close: ReturnType<typeof vi.fn>; height: number; width: number }>,
  canvases: [] as FakeCanvas[],
  convertToBlob: vi.fn(),
  drawImage: vi.fn(),
}));

class FakeCanvas {
  readonly height: number;
  readonly width: number;
  readonly context = { drawImage: mocks.drawImage };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    mocks.canvases.push(this);
  }

  convertToBlob(): Promise<Blob> {
    return mocks.convertToBlob();
  }

  getContext(): typeof this.context {
    return this.context;
  }
}

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: vi.fn().mockResolvedValue({ imageFormat: 'png', imageQuality: 100 }),
}));

vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  blobToDataURL: vi.fn().mockResolvedValue('data:image/png;base64,stitched'),
}));

import { createStreamingFullPageStitcher } from './stitch';
import type {
  FullPageCaptureGeometry,
  FullPageCaptureTileState,
} from '../../../contracts/full-page-capture';
import type { FullPageTilePlan } from './planner';

const documentGeometry: FullPageCaptureGeometry = {
  devicePixelRatio: 1,
  extentHeight: 1_100,
  extentWidth: 800,
  outputHeight: 1_100,
  outputWidth: 800,
  rootKind: 'document',
  rootViewport: { height: 600, width: 800, x: 0, y: 0 },
  viewportHeight: 600,
  viewportWidth: 800,
};

function tilePlan(overrides: Partial<FullPageTilePlan> = {}): FullPageTilePlan {
  return {
    column: 0,
    firstColumn: true,
    firstRow: true,
    lastColumn: true,
    lastRow: true,
    row: 0,
    sourceInsetX: 0,
    sourceInsetY: 0,
    targetX: 0,
    targetY: 0,
    ...overrides,
  };
}

function tileState(
  geometry: FullPageCaptureGeometry,
  overrides: Partial<FullPageCaptureTileState> = {}
): FullPageCaptureTileState {
  return {
    actualX: 0,
    actualY: 0,
    frozenExtentWarning: false,
    geometry,
    layoutGeneration: 'layout-1',
    ...overrides,
  };
}

function enqueueBitmap(width = 800, height = 600) {
  const bitmap = { close: vi.fn(), height, width };
  mocks.bitmaps.push(bitmap);
  return bitmap;
}

beforeEach(() => {
  mocks.bitmaps.length = 0;
  mocks.canvases.length = 0;
  mocks.drawImage.mockClear();
  mocks.convertToBlob.mockReset();
  mocks.convertToBlob.mockResolvedValue(new Blob(['encoded'], { type: 'image/png' }));
  vi.stubGlobal('OffscreenCanvas', FakeCanvas);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob()), ok: true })
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      const bitmap = mocks.bitmaps.shift();
      if (!bitmap) throw new Error('No queued bitmap');
      return bitmap;
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('draws and releases each decoded tile before encoding one final image', async () => {
  const first = enqueueBitmap();
  const second = enqueueBitmap();
  const stitcher = await createStreamingFullPageStitcher({
    firstFrameDataUrl: 'tile-1',
    frozenExtentWarning: false,
    geometry: documentGeometry,
    warnings: [],
  });

  await stitcher.drawFrame('tile-1', tilePlan({ lastRow: false }), tileState(documentGeometry));
  expect(first.close).toHaveBeenCalledOnce();
  await stitcher.drawFrame(
    'tile-2',
    tilePlan({ firstRow: false, row: 1, sourceInsetY: 64, targetY: 500 }),
    tileState(documentGeometry, { actualY: 500, frozenExtentWarning: true })
  );
  expect(second.close).toHaveBeenCalledOnce();

  const result = await stitcher.finish({ format: 'png', quality: 1 });

  expect(result.dataUrl).toBe('data:image/png;base64,stitched');
  expect(result.metadata).toEqual(
    expect.objectContaining({
      cssHeight: 1_100,
      cssWidth: 800,
      frozenExtentWarning: true,
      outputHeight: 1_100,
      outputScale: 1,
      outputWidth: 800,
    })
  );
  expect(mocks.drawImage).toHaveBeenCalledTimes(2);
});

it('draws the outer shell once and replaces only the internal scroller viewport', async () => {
  const internalGeometry: FullPageCaptureGeometry = {
    devicePixelRatio: 1,
    extentHeight: 1_000,
    extentWidth: 700,
    outputHeight: 1_200,
    outputWidth: 800,
    rootKind: 'element',
    rootViewport: { height: 400, width: 700, x: 50, y: 100 },
    viewportHeight: 600,
    viewportWidth: 800,
  };
  enqueueBitmap();
  const stitcher = await createStreamingFullPageStitcher({
    firstFrameDataUrl: 'tile-shell',
    frozenExtentWarning: false,
    geometry: internalGeometry,
    warnings: [],
  });

  await stitcher.drawFrame('tile-shell', tilePlan(), tileState(internalGeometry));

  expect(mocks.drawImage).toHaveBeenCalledTimes(5);
  expect(mocks.canvases[0]).toEqual(expect.objectContaining({ height: 1_200, width: 800 }));
});

it('rejects scale drift and still closes the disputed frame', async () => {
  enqueueBitmap();
  const disputed = enqueueBitmap(790, 600);
  const stitcher = await createStreamingFullPageStitcher({
    firstFrameDataUrl: 'tile-1',
    frozenExtentWarning: false,
    geometry: documentGeometry,
    warnings: [],
  });
  await stitcher.drawFrame('tile-1', tilePlan(), tileState(documentGeometry));

  await expect(
    stitcher.drawFrame('tile-2', tilePlan(), tileState(documentGeometry))
  ).rejects.toThrow('scale changed');
  expect(disputed.close).toHaveBeenCalledOnce();
});

it('rejects a raster whose minimum safe output scale would exceed budgets', async () => {
  const bitmap = enqueueBitmap();
  const oversizedGeometry: FullPageCaptureGeometry = {
    ...documentGeometry,
    extentHeight: 100_000,
    extentWidth: 100_000,
    outputHeight: 100_000,
    outputWidth: 100_000,
  };

  await expect(
    createStreamingFullPageStitcher({
      firstFrameDataUrl: 'tile-oversized',
      frozenExtentWarning: false,
      geometry: oversizedGeometry,
      warnings: [],
    })
  ).rejects.toThrow('raster memory or dimension limits');
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('fails closed when a tile cannot be decoded or an output context cannot be created', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  await expect(
    createStreamingFullPageStitcher({
      firstFrameDataUrl: 'bad-tile',
      frozenExtentWarning: false,
      geometry: documentGeometry,
      warnings: [],
    })
  ).rejects.toThrow('Unable to decode');

  const bitmap = enqueueBitmap();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob()), ok: true })
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        readonly width: number,
        readonly height: number
      ) {}
      getContext() {
        return null;
      }
    }
  );
  await expect(
    createStreamingFullPageStitcher({
      firstFrameDataUrl: 'tile-no-context',
      frozenExtentWarning: false,
      geometry: documentGeometry,
      warnings: [],
    })
  ).rejects.toThrow('Unable to create full-page screenshot canvas');
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('skips zero-area document and internal-scroller tile regions', async () => {
  const documentBitmap = enqueueBitmap();
  const documentStitcher = await createStreamingFullPageStitcher({
    firstFrameDataUrl: 'tile-document-empty',
    frozenExtentWarning: false,
    geometry: documentGeometry,
    warnings: [],
  });
  await documentStitcher.drawFrame(
    'tile-document-empty',
    tilePlan({ sourceInsetX: 800 }),
    tileState(documentGeometry)
  );
  expect(documentBitmap.close).toHaveBeenCalledOnce();
  expect(mocks.drawImage).not.toHaveBeenCalled();

  const internalGeometry: FullPageCaptureGeometry = {
    ...documentGeometry,
    extentWidth: 700,
    outputHeight: 1_200,
    rootKind: 'element',
    rootViewport: { height: 400, width: 700, x: 50, y: 100 },
  };
  const internalBitmap = enqueueBitmap();
  const internalStitcher = await createStreamingFullPageStitcher({
    firstFrameDataUrl: 'tile-internal-empty',
    frozenExtentWarning: false,
    geometry: internalGeometry,
    warnings: [],
  });
  await internalStitcher.drawFrame(
    'tile-internal-empty',
    tilePlan({ sourceInsetX: 700 }),
    tileState(internalGeometry)
  );
  expect(internalBitmap.close).toHaveBeenCalledOnce();
  expect(mocks.drawImage).toHaveBeenCalledTimes(4);
});

it('crops a padded browser surface to the prepared custom viewport scale', async () => {
  const emulated = enqueueBitmap(1_600, 900);
  const emulatedStitcher = await createStreamingFullPageStitcher({
    firstFrameDataUrl: 'tile-emulated',
    frozenExtentWarning: false,
    geometry: documentGeometry,
    warnings: [],
  });
  await emulatedStitcher.drawFrame('tile-emulated', tilePlan(), tileState(documentGeometry));
  expect(emulated.close).toHaveBeenCalledOnce();
  expect(mocks.drawImage).toHaveBeenCalledWith(emulated, 0, 0, 800, 600, 0, 0, 800, 600);
  expect(mocks.canvases[0]).toEqual(expect.objectContaining({ height: 1_100, width: 800 }));

  const invalid = enqueueBitmap(798, 598);
  await expect(
    createStreamingFullPageStitcher({
      firstFrameDataUrl: 'tile-invalid',
      frozenExtentWarning: false,
      geometry: documentGeometry,
      warnings: [],
    })
  ).rejects.toThrow('does not cover the prepared viewport');
  expect(invalid.close).toHaveBeenCalledOnce();

  const pending = enqueueBitmap();
  const stitcher = await createStreamingFullPageStitcher({
    firstFrameDataUrl: 'tile-pending',
    frozenExtentWarning: false,
    geometry: documentGeometry,
    warnings: [],
  });
  await expect(stitcher.finish({ format: 'png' })).rejects.toThrow('produced no tiles');
  expect(pending.close).toHaveBeenCalledOnce();
});

it('does not publish a screenshot when cancellation arrives during final encoding', async () => {
  let resolveEncoding: (blob: Blob) => void = () => undefined;
  mocks.convertToBlob.mockImplementationOnce(
    () =>
      new Promise<Blob>((resolve) => {
        resolveEncoding = resolve;
      })
  );
  enqueueBitmap();
  const stitcher = await createStreamingFullPageStitcher({
    firstFrameDataUrl: 'tile-cancelled-encode',
    frozenExtentWarning: false,
    geometry: documentGeometry,
    warnings: [],
  });
  await stitcher.drawFrame('tile-cancelled-encode', tilePlan(), tileState(documentGeometry));
  const controller = new AbortController();
  const finishing = stitcher.finish({ format: 'png' }, controller.signal);
  await Promise.resolve();
  controller.abort(new Error('cancelled during encode'));
  resolveEncoding(new Blob(['encoded'], { type: 'image/png' }));

  await expect(finishing).rejects.toThrow('cancelled during encode');
});
