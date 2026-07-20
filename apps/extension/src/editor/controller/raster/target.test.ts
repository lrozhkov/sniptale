// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact raster target proof keeps canonical ready and blocked branches together */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fabricMocks = vi.hoisted(() => ({
  sendPointToPlane: vi.fn((point) => point),
}));
vi.mock('fabric', () => {
  return {
    Point: class Point {
      constructor(
        public x: number,
        public y: number
      ) {}
    },
    util: {
      sendPointToPlane: fabricMocks.sendPointToPlane,
    },
  };
});
const dependencyMocks = vi.hoisted(() => ({
  getSingleSelectionType: vi.fn(() => 'Rectangle'),
  isBlurObject: vi.fn(() => false),
  isEditableObject: vi.fn(() => true),
  loadRasterCanvasFromDataUrl: vi.fn(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 6;
    return canvas;
  }),
}));
vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  getSingleSelectionType: dependencyMocks.getSingleSelectionType,
  isEditableObject: dependencyMocks.isEditableObject,
}));
vi.mock('../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/blur/object')>()),
  isBlurObject: dependencyMocks.isBlurObject,
}));
vi.mock('./bitmap', async () => {
  const actual = await vi.importActual<typeof import('./bitmap')>('./bitmap');
  return {
    ...actual,
    loadRasterCanvasFromDataUrl: dependencyMocks.loadRasterCanvasFromDataUrl,
  };
});
import { Point } from 'fabric';
import {
  createRasterTargetSnapshot,
  resolveBitmapPoint,
  resolveRasterTarget,
  resolveRasterTargetState,
} from './target';
describe('editor-controller/raster/target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('resolves canonical raster target states from the active layer only', async () => {
    const rasterObject = {
      getBoundingRect: () => ({ left: 10, top: 20, width: 30, height: 40 }),
      sniptaleType: 'image',
      sniptaleId: 'layer-1',
      sniptaleLabel: 'Layer 1',
      toCanvasElement: () => document.createElement('canvas'),
      visible: true,
    };
    const canvas = {
      getActiveObject: () => rasterObject,
      getActiveObjects: () => [rasterObject as never],
    };
    expect(resolveRasterTargetState({ canvas: canvas as never })).toEqual({
      summary: {
        layerId: 'layer-1',
        layerName: 'Layer 1',
        status: 'ready',
      },
      target: expect.objectContaining({
        object: rasterObject,
        reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      }),
    });
    expect(resolveRasterTarget({ canvas: canvas as never })).toEqual(
      expect.objectContaining({
        object: rasterObject,
        reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      })
    );
    const vectorObject = {
      ...rasterObject,
      sniptaleId: 'layer-2',
      sniptaleLabel: 'Layer 2',
      sniptaleType: 'rectangle',
    };
    expect(
      resolveRasterTargetState({
        canvas: {
          getActiveObject: () => vectorObject,
          getActiveObjects: () => [vectorObject as never],
        } as never,
      })
    ).toEqual({
      summary: {
        layerId: 'layer-2',
        layerName: 'Layer 2',
        status: 'will-rasterize',
      },
      target: expect.objectContaining({
        object: vectorObject,
        reference: { kind: 'object', objectId: 'layer-2', objectName: 'Layer 2' },
      }),
    });

    const objectSnapshot = await createRasterTargetSnapshot({
      object: rasterObject as never,
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    });
    expect(objectSnapshot.sceneBounds.width).toBe(30);
    expect(dependencyMocks.loadRasterCanvasFromDataUrl).not.toHaveBeenCalled();
  });

  it('captures blur target snapshots through the rendered data URL path', async () => {
    dependencyMocks.isBlurObject.mockReturnValueOnce(true);
    const toCanvasElement = vi.fn(() => document.createElement('canvas'));
    const blurObject = {
      getBoundingRect: () => ({ left: 10, top: 20, width: 30, height: 40 }),
      sniptaleType: 'blur',
      toCanvasElement,
      toDataURL: vi.fn(() => 'data:image/png;base64,blur'),
      visible: true,
    };

    const snapshot = await createRasterTargetSnapshot({
      object: blurObject as never,
      reference: { kind: 'object', objectId: 'blur-1', objectName: 'Blur 1' },
    });

    expect(blurObject.toDataURL).toHaveBeenCalledWith({ format: 'png' });
    expect(dependencyMocks.loadRasterCanvasFromDataUrl).toHaveBeenCalledWith(
      'data:image/png;base64,blur'
    );
    expect(toCanvasElement).not.toHaveBeenCalled();
    expect(snapshot.bitmap.width).toBe(12);
  });
  it('maps scene points into bitmap coordinates for canonical single-object targets', () => {
    fabricMocks.sendPointToPlane.mockReturnValueOnce({ x: -5, y: -4 });
    const snapshot = {
      bitmap: { width: 10, height: 10 },
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      sceneBounds: { left: 0, top: 0, width: 20, height: 20 },
    };
    expect(
      resolveBitmapPoint({
        snapshot: snapshot as never,
        canvas: {} as never,
        reference: snapshot.reference as never,
        scenePoint: new Point(5, 6),
        targetObject: { calcTransformMatrix: () => [], height: 20, width: 20 } as never,
      })
    ).toEqual({ x: 5, y: 6 });
  });
  it('uses Fabric pathOffset as the bitmap origin when mapping transformed raster points', () => {
    fabricMocks.sendPointToPlane.mockReturnValueOnce({ x: 4, y: 6 });
    const snapshot = {
      bitmap: { width: 40, height: 30 },
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      sceneBounds: { left: 0, top: 0, width: 40, height: 30 },
    };
    expect(
      resolveBitmapPoint({
        snapshot: snapshot as never,
        canvas: {} as never,
        reference: snapshot.reference as never,
        scenePoint: new Point(14, 16),
        targetObject: {
          calcTransformMatrix: () => [],
          pathOffset: { x: 20, y: 15 },
        } as never,
      })
    ).toEqual({ x: 24, y: 21 });
  });
  it('reports explicit blocked states instead of falling back to hover or active-selection targets', () => {
    expect(resolveRasterTarget({ canvas: null })).toBeNull();
    expect(resolveRasterTargetState({ canvas: null })).toEqual({
      summary: { layerId: null, layerName: null, status: 'missing' },
      target: null,
    });
    const lockedObject = {
      sniptaleId: 'layer-3',
      sniptaleLabel: 'Layer 3',
      sniptaleLocked: true,
      visible: true,
    };
    expect(
      resolveRasterTargetState({
        canvas: {
          getActiveObject: () => lockedObject,
          getActiveObjects: () => [lockedObject as never],
        } as never,
      })
    ).toEqual({
      summary: {
        layerId: 'layer-3',
        layerName: 'Layer 3',
        status: 'locked',
      },
      target: null,
    });
    const firstObject = {
      sniptaleId: 'layer-1',
      sniptaleLabel: 'Layer 1',
      sniptaleLocked: false,
      visible: true,
    };
    const secondObject = {
      sniptaleId: 'layer-2',
      sniptaleLabel: 'Layer 2',
      sniptaleLocked: false,
      visible: true,
    };
    expect(
      resolveRasterTargetState({
        canvas: {
          getActiveObject: () => null,
          getActiveObjects: () => [firstObject as never, secondObject as never],
        } as never,
      })
    ).toEqual({
      summary: { layerId: null, layerName: null, status: 'multiple' },
      target: null,
    });
  });
});
