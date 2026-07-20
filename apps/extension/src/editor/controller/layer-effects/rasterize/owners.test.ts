// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const activeSelectionMocks = vi.hoisted(() => ({
  getBoundingRect: vi.fn(() => ({ height: 40, left: 4, top: 8, width: 20 })),
  setCoords: vi.fn(),
  toDataURL: vi.fn(() => 'data:image/png;base64,selection'),
}));

vi.mock('fabric', () => {
  class ActiveSelection {
    constructor(_objects: unknown[], _options: unknown) {}

    getBoundingRect = activeSelectionMocks.getBoundingRect;
    setCoords = activeSelectionMocks.setCoords;
    toDataURL = activeSelectionMocks.toDataURL;
  }

  class FabricImage {
    static async fromURL(_url: string) {
      return new FabricImage();
    }

    getElement() {
      return { height: 100, width: 200 };
    }

    set(payload: Record<string, unknown>) {
      Object.assign(this, payload);
    }
  }

  return { ActiveSelection, FabricImage };
});

vi.mock('../../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../../document/model')>('../../../document/model')),
  isSourceObject: (object: { sniptaleRole?: string; sniptaleType?: string }) =>
    object.sniptaleRole === 'source' || object.sniptaleType === 'source-image',
}));

import { createRasterizedEditorImage } from './image-object';
import { isEditorRasterLayerType } from './layer-type';
import { rasterizeEditorObjects } from './render-data';
import { buildRasterizedSourceState } from './source-state';

beforeEach(() => {
  vi.clearAllMocks();
});

it('keeps raster layer type detection in the layer-type owner', () => {
  expect(isEditorRasterLayerType('image')).toBe(true);
  expect(isEditorRasterLayerType('source-image')).toBe(true);
  expect(isEditorRasterLayerType('rectangle')).toBe(false);
});

it('keeps object and selection render data in the render-data owner', () => {
  const object = {
    getBoundingRect: () => ({ height: 10, left: 1, top: 2, width: 20 }),
    toDataURL: () => 'data:image/png;base64,object',
  };

  expect(rasterizeEditorObjects({} as never, [])).toBeNull();
  expect(rasterizeEditorObjects({} as never, [object as never])).toEqual({
    bounds: { height: 10, left: 1, top: 2, width: 20 },
    dataUrl: 'data:image/png;base64,object',
  });
  expect(rasterizeEditorObjects({} as never, [object as never, object as never])).toEqual({
    bounds: { height: 40, left: 4, top: 8, width: 20 },
    dataUrl: 'data:image/png;base64,selection',
  });
});

it('keeps image object construction in the image-object owner', async () => {
  const image = await createRasterizedEditorImage({
    dataUrl: 'data:image/png;base64,layer',
    id: 'layer-1',
    left: 10,
    locked: true,
    name: 'Layer 1',
    role: 'source',
    top: 20,
    type: 'source-image',
    visible: false,
  });

  expect(image).toEqual(
    expect.objectContaining({
      left: 10,
      sniptaleEffects: [],
      sniptaleId: 'layer-1',
      sniptaleLabel: 'Layer 1',
      sniptaleLocked: true,
      sniptaleRole: 'source',
      sniptaleType: 'source-image',
      top: 20,
      visible: false,
    })
  );
});

it('keeps source-state refresh in the source-state owner', async () => {
  const image = await createRasterizedEditorImage({
    dataUrl: 'data:image/png;base64,layer',
    id: 'layer-1',
    left: 10,
    locked: true,
    name: 'Layer 1',
    role: 'source',
    top: 20,
    type: 'source-image',
    visible: false,
  });
  Object.assign(image, {
    getScaledHeight: () => 60,
    getScaledWidth: () => 120,
    toDataURL: () => 'data:image/png;base64,layer',
  });

  expect(
    buildRasterizedSourceState({ id: 'source' } as never, { sniptaleRole: 'annotation' } as never)
  ).toEqual({ id: 'source' });
  expect(buildRasterizedSourceState(null, image as never)).toBeNull();
  expect(buildRasterizedSourceState({ id: 'source' } as never, image as never)).toEqual(
    expect.objectContaining({
      dataUrl: 'data:image/png;base64,layer',
      displayHeight: 60,
      displayWidth: 120,
      intrinsicHeight: 100,
      intrinsicWidth: 200,
    })
  );
});
