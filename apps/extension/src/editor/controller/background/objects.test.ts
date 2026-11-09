// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fromURL: vi.fn(),
  rasterize: vi.fn(() => ({ kind: 'blurred-background' })),
}));

vi.mock('./raster', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./raster')>();
  return {
    ...actual,
    rasterizeBlurredBackground: mocks.rasterize,
    createAdvancedBackgroundImage: vi.fn(actual.createAdvancedBackgroundImage),
    resolveBackgroundRasterSize: vi.fn(actual.resolveBackgroundRasterSize),
  };
});

vi.mock('fabric', () => ({
  FabricImage: {
    fromURL: mocks.fromURL,
  },
  Gradient: class Gradient {
    constructor(values: Record<string, unknown>) {
      Object.assign(this, values);
    }
  },
  Pattern: class Pattern {
    constructor(values: Record<string, unknown>) {
      Object.assign(this, values);
    }
  },
  Rect: class Rect {
    constructor(values: Record<string, unknown>) {
      Object.assign(this, values);
    }
  },
}));
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { createBackgroundLayer } from './objects';
import { createAdvancedBackgroundImage, resolveBackgroundRasterSize } from './raster';

function createFrame(patch: Partial<EditorFrameSettings>): EditorFrameSettings {
  return {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundColor: '#112233',
    backgroundImageData: 'data:image/png;base64,abc',
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('creates solid, gradient, and transparent background layers', async () => {
  await expect(
    createBackgroundLayer({ width: 0, height: 180 }, createFrame({ backgroundMode: 'color' }))
  ).resolves.toBeNull();
  await expect(
    createBackgroundLayer(
      { width: 320, height: 180 },
      createFrame({ backgroundColor: 'transparent', backgroundMode: 'color' })
    )
  ).resolves.toBeNull();

  const color = await createBackgroundLayer(
    { width: 320, height: 180 },
    createFrame({ backgroundMode: 'color' })
  );
  const gradient = await createBackgroundLayer(
    { width: 320, height: 180 },
    createFrame({ backgroundGradientAngle: 45, backgroundMode: 'gradient' })
  );

  expect(color).toMatchObject({ fill: '#112233', height: 180, strokeWidth: 0, width: 320 });
  expect(gradient).toMatchObject({
    fill: expect.objectContaining({ type: 'linear' }),
    strokeWidth: 0,
  });
});

it('creates image backgrounds for stretch and tile fits', async () => {
  const image = { height: 50, set: vi.fn(), width: 100 };
  mocks.fromURL.mockResolvedValue(image);
  class MockImage {
    onload: (() => void) | null = null;
    set src(_source: string) {
      this.onload?.();
    }
  }
  vi.stubGlobal('Image', MockImage);

  await createBackgroundLayer(
    { width: 320, height: 180 },
    createFrame({ backgroundImageFit: 'stretch', backgroundMode: 'image' })
  );
  const tiled = await createBackgroundLayer(
    { width: 320, height: 180 },
    createFrame({ backgroundImageFit: 'tile', backgroundMode: 'image' })
  );

  expect(image.set).toHaveBeenCalledWith(
    expect.objectContaining({ scaleX: 3.2, scaleY: 3.6, strokeWidth: 0 })
  );
  expect(tiled).toMatchObject({
    fill: expect.objectContaining({ repeat: 'repeat' }),
    strokeWidth: 0,
  });
  vi.unstubAllGlobals();
});

it('keeps the fast path at zero and rasterizes the full backing above zero', async () => {
  const fast = await createBackgroundLayer(
    { width: 320, height: 180 },
    createFrame({ backgroundBlurAmount: 0, backgroundMode: 'color' })
  );
  const blurred = await createBackgroundLayer(
    { width: 320, height: 180 },
    createFrame({ backgroundBlurAmount: 12, backgroundMode: 'gradient' })
  );

  expect(fast).toMatchObject({ fill: '#112233' });
  expect(mocks.rasterize).toHaveBeenCalledWith(
    expect.objectContaining({ amount: 12, targetSize: { width: 320, height: 180 } })
  );
  expect(blurred).toEqual({ kind: 'blurred-background' });
});

it('threads transient quality through blurred and advanced gradient creation', async () => {
  const frame = createFrame({ backgroundMode: 'gradient', backgroundBlurAmount: 12 });
  await createBackgroundLayer({ width: 6000, height: 4000 }, frame, true);
  expect(resolveBackgroundRasterSize).toHaveBeenCalledWith({ width: 6000, height: 4000 }, true);
  expect(createAdvancedBackgroundImage).toHaveBeenCalledWith(
    { width: 768, height: 512 },
    frame,
    true
  );
  expect(mocks.rasterize).toHaveBeenCalledWith(
    expect.objectContaining({
      rasterSize: { width: 768, height: 512 },
      targetSize: { width: 6000, height: 4000 },
    })
  );
});

it('preserves the final tile frequency in smaller transient blur rasters', async () => {
  class MockImage {
    onload: (() => void) | null = null;
    set src(_source: string) {
      this.onload?.();
    }
  }
  vi.stubGlobal('Image', MockImage);
  try {
    const frame = createFrame({
      backgroundMode: 'image',
      backgroundImageFit: 'tile',
      backgroundBlurAmount: 12,
    });
    await createBackgroundLayer({ width: 6000, height: 4000 }, frame, true);
    expect(mocks.rasterize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        object: expect.objectContaining({
          fill: expect.objectContaining({
            patternTransform: [768 / 2048, 0, 0, 512 / 1365, 0, 0],
          }),
        }),
      })
    );
    await createBackgroundLayer({ width: 6000, height: 4000 }, frame);
    expect(mocks.rasterize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rasterSize: { width: 2048, height: 1365 },
        object: expect.objectContaining({
          fill: expect.not.objectContaining({ patternTransform: expect.anything() }),
        }),
      })
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
