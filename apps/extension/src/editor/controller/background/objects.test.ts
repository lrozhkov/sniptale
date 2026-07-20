// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fromURL: vi.fn(),
}));

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
