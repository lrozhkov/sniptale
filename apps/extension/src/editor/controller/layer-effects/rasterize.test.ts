/* eslint-disable max-lines-per-function -- rasterize coverage keeps the full source-state seam together */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  isSourceObject: (object: { sniptaleRole?: string; sniptaleType?: string }) =>
    object.sniptaleRole === 'source' || object.sniptaleType === 'source-image',
}));

import {
  buildRasterizedSourceState,
  createRasterizedEditorImage,
  isEditorRasterLayerType,
  rasterizeEditorObjects,
} from './rasterize';

describe('editor-controller layer-effects rasterize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('identifies raster layer types and rasterizes single or multi-object selections', () => {
    const object = {
      getBoundingRect: () => ({ height: 10, left: 1, top: 2, width: 20 }),
      toDataURL: () => 'data:image/png;base64,object',
    };

    expect(isEditorRasterLayerType('image')).toBe(true);
    expect(isEditorRasterLayerType('source-image')).toBe(true);
    expect(isEditorRasterLayerType('rectangle')).toBe(false);
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

  it('creates rasterized images and refreshes source state metadata', async () => {
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
      left: 10,
      sniptaleId: 'layer-1',
      sniptaleLabel: 'Layer 1',
      sniptaleLocked: true,
      sniptaleRole: 'source',
      sniptaleType: 'source-image',
      toDataURL: () => 'data:image/png;base64,layer',
      top: 20,
      visible: false,
    });
    const sourceState = buildRasterizedSourceState(
      {
        dataUrl: 'source',
        displayHeight: 40,
        displayWidth: 50,
        id: 'source',
        intrinsicHeight: 40,
        intrinsicWidth: 50,
        left: 1,
        locked: false,
        name: 'Source',
        top: 2,
        visible: true,
      },
      image as never
    );

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
    expect(sourceState).toEqual(
      expect.objectContaining({
        dataUrl: 'data:image/png;base64,layer',
        displayHeight: 60,
        displayWidth: 120,
        id: 'layer-1',
        intrinsicHeight: 100,
        intrinsicWidth: 200,
        left: 10,
        locked: true,
        name: 'Layer 1',
        top: 20,
        visible: false,
      })
    );
    expect(
      buildRasterizedSourceState(
        { id: 'source' } as never,
        { sniptaleRole: 'annotation', sniptaleType: 'rectangle' } as never
      )
    ).toEqual({ id: 'source' });
  });

  it('falls back to scaled dimensions for non-image source objects', () => {
    const sourceState = buildRasterizedSourceState(
      {
        dataUrl: 'source',
        displayHeight: 40,
        displayWidth: 50,
        id: 'source',
        intrinsicHeight: 40,
        intrinsicWidth: 50,
        left: 1,
        locked: false,
        name: 'Source',
        top: 2,
        visible: true,
      },
      {
        getScaledHeight: () => 22,
        getScaledWidth: () => 11,
        left: undefined,
        sniptaleId: undefined,
        sniptaleLabel: undefined,
        sniptaleLocked: false,
        sniptaleRole: 'source',
        sniptaleType: 'source-image',
        toDataURL: () => 'data:image/png;base64,vector-source',
        top: undefined,
        visible: true,
      } as never
    );

    expect(sourceState).toEqual(
      expect.objectContaining({
        dataUrl: 'data:image/png;base64,vector-source',
        displayHeight: 22,
        displayWidth: 11,
        id: 'source',
        intrinsicHeight: 22,
        intrinsicWidth: 11,
        left: 1,
        name: 'Source',
        top: 2,
      })
    );
  });

  it('uses intrinsic image dimensions from html image elements when available', async () => {
    const image = await createRasterizedEditorImage({
      dataUrl: 'data:image/png;base64,layer',
      id: 'layer-1',
      left: 0,
      locked: false,
      name: 'Layer 1',
      role: 'source',
      top: 0,
      type: 'source-image',
      visible: true,
    });
    const element = document.createElement('img');
    Object.defineProperty(element, 'naturalWidth', { value: 320 });
    Object.defineProperty(element, 'naturalHeight', { value: 180 });
    Object.assign(image, {
      getElement: () => element,
      getScaledHeight: () => 60,
      getScaledWidth: () => 120,
      sniptaleRole: 'source',
      sniptaleType: 'source-image',
      toDataURL: () => 'data:image/png;base64,layer',
    });

    expect(buildRasterizedSourceState({ id: 'source' } as never, image as never)).toEqual(
      expect.objectContaining({
        intrinsicHeight: 180,
        intrinsicWidth: 320,
      })
    );
  });
});
