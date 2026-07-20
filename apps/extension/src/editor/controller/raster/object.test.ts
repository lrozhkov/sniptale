// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact raster object proof keeps overlay and single-object replacement branches together */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fabricMocks = vi.hoisted(() => ({
  fromURL: vi.fn(),
}));

vi.mock('fabric', async () => {
  const actual = await vi.importActual<typeof import('fabric')>('fabric');
  return {
    ...actual,
    FabricImage: {
      fromURL: fabricMocks.fromURL,
    },
  };
});

const dependencyMocks = vi.hoisted(() => ({
  canvasToRasterDataUrl: vi.fn(() => 'data:image/png;base64,bitmap'),
  findObjectById: vi.fn(),
  isSourceObject: vi.fn(() => false),
}));

vi.mock('../document/layers', async () => ({
  ...(await vi.importActual<typeof import('../document/layers')>('../document/layers')),
  findObjectById: dependencyMocks.findObjectById,
}));

vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  isSourceObject: dependencyMocks.isSourceObject,
}));

vi.mock('./bitmap', async () => ({
  ...(await vi.importActual<typeof import('./bitmap')>('./bitmap')),
  canvasToRasterDataUrl: dependencyMocks.canvasToRasterDataUrl,
}));

import { applyRasterBitmapToTarget, resolveRasterOverlayObject } from './object';

function createReplacement() {
  return {
    getScaledHeight: vi.fn(() => 25),
    getScaledWidth: vi.fn(() => 50),
    height: 25,
    set: vi.fn(),
    setCoords: vi.fn(),
    width: 50,
  };
}

function createCanvas() {
  return {
    add: vi.fn(),
    getActiveObject: vi.fn(() => null),
    getObjects: vi.fn(() => []),
    moveObjectTo: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

describe('editor-controller/raster/object', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fabricMocks.fromURL.mockResolvedValue(createReplacement());
  });

  it('resolves overlay objects for canonical object references only', () => {
    const targetObject = { id: 'target' };
    const canvas = {};

    dependencyMocks.findObjectById.mockReturnValue(targetObject);

    expect(
      resolveRasterOverlayObject(canvas as never, {
        kind: 'object',
        objectId: 'layer-1',
        objectName: 'Layer 1',
      })
    ).toBe(targetObject);
    expect(
      resolveRasterOverlayObject(null, { kind: 'object', objectId: 'x', objectName: 'X' })
    ).toBeNull();
  });

  it('replaces single objects with rasterized images in place', async () => {
    const bitmap = document.createElement('canvas');
    bitmap.width = 50;
    bitmap.height = 25;
    const canvas = createCanvas();
    const object = {
      angle: 0,
      flipX: false,
      flipY: false,
      left: 4,
      sniptaleId: 'layer-1',
      sniptaleImageOpacity: 0.5,
      sniptaleImageRadius: 8,
      sniptaleLabel: 'Layer 1',
      sniptaleLocked: false,
      sniptaleType: 'image',
      opacity: 1,
      originX: 'left',
      originY: 'top',
      getScaledHeight: () => 100,
      getScaledWidth: () => 200,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      visible: true,
    };
    canvas.getObjects.mockReturnValue([object] as never);
    dependencyMocks.findObjectById.mockImplementation((_canvas, id: string) =>
      id === 'layer-1' || id === 'layer-2' ? (object as never) : null
    );

    const context = {
      canvas: canvas as never,
      commitHistory: vi.fn(),
      createLayerMutationToken: vi.fn(() => 1),
      isLayerMutationTokenCurrent: vi.fn(() => true),
      prepareObject: vi.fn(),
      sendFrameObjectsToBack: vi.fn(),
      setSourceFromObject: vi.fn(),
      syncRuntimeState: vi.fn(),
    };

    await applyRasterBitmapToTarget({
      bitmap,
      context: context as never,
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    });

    expect(fabricMocks.fromURL).toHaveBeenCalledWith('data:image/png;base64,bitmap');
    expect(canvas.remove).toHaveBeenCalledWith(object);
    expect(canvas.add).toHaveBeenCalled();
    const replacement = canvas.add.mock.calls[0]?.[0] as
      | { sniptaleId?: string; sniptaleLabel?: string; set: ReturnType<typeof vi.fn> }
      | undefined;
    expect(replacement).toEqual(
      expect.objectContaining({
        sniptaleId: 'layer-1',
        sniptaleLabel: 'Layer 1',
      })
    );
    expect(canvas.setActiveObject).toHaveBeenCalledWith(replacement);
    expect(replacement?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        scaleX: 4,
        scaleY: 4,
      })
    );
    expect(replacement?.set).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.5 }));
    expect(context.commitHistory).toHaveBeenCalledOnce();
    expect(context.syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('preserves managed background image identity when raster brush commits into it', async () => {
    const bitmap = document.createElement('canvas');
    bitmap.width = 100;
    bitmap.height = 60;
    const canvas = createCanvas();
    const object = {
      getScaledHeight: () => 60,
      getScaledWidth: () => 100,
      left: 0,
      sniptaleBackgroundImageData: 'data:image/png;base64,background',
      sniptaleBackgroundMode: 'image',
      sniptaleId: 'background-1',
      sniptaleLabel: 'Background image',
      sniptaleLocked: true,
      sniptaleRole: 'background',
      sniptaleType: 'background',
      originX: 'left',
      originY: 'top',
      visible: true,
    };
    canvas.getObjects.mockReturnValue([object] as never);
    dependencyMocks.findObjectById.mockReturnValue(object);

    const context = {
      canvas: canvas as never,
      commitHistory: vi.fn(),
      createLayerMutationToken: vi.fn(() => 1),
      isLayerMutationTokenCurrent: vi.fn(() => true),
      prepareObject: vi.fn(),
      sendFrameObjectsToBack: vi.fn(),
      setSourceFromObject: vi.fn(),
      syncRuntimeState: vi.fn(),
    };

    await applyRasterBitmapToTarget({
      bitmap,
      context: context as never,
      reference: { kind: 'object', objectId: 'background-1', objectName: 'Background image' },
    });

    const replacement = canvas.add.mock.calls[0]?.[0] as
      | { sniptaleBackgroundMode?: string; sniptaleRole?: string; sniptaleType?: string }
      | undefined;
    expect(replacement).toEqual(
      expect.objectContaining({
        sniptaleBackgroundMode: 'image',
        sniptaleRole: 'background',
        sniptaleType: 'background',
      })
    );
  });

  it('returns null when the target object or canvas is unavailable', async () => {
    const bitmap = document.createElement('canvas');
    dependencyMocks.findObjectById.mockReturnValue(null);

    await expect(
      applyRasterBitmapToTarget({
        bitmap,
        context: {
          canvas: null,
        } as never,
        reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      })
    ).resolves.toBeNull();

    await expect(
      applyRasterBitmapToTarget({
        bitmap,
        context: {
          canvas: createCanvas() as never,
        } as never,
        reference: { kind: 'object', objectId: 'missing', objectName: 'Missing' },
      })
    ).resolves.toBeNull();
  });

  it('drops stale layer mutations and ignores unavailable object references', async () => {
    const bitmap = document.createElement('canvas');
    const canvas = createCanvas();
    const object = {
      left: 4,
      sniptaleId: 'layer-1',
      sniptaleLabel: 'Layer 1',
      visible: true,
    };
    canvas.getObjects.mockReturnValue([object] as never);
    dependencyMocks.findObjectById.mockImplementation((_canvas, id: string) =>
      id === 'layer-1' ? (object as never) : null
    );

    await expect(
      applyRasterBitmapToTarget({
        bitmap,
        context: {
          canvas: canvas as never,
          commitHistory: vi.fn(),
          createLayerMutationToken: vi.fn(() => 1),
          isLayerMutationTokenCurrent: vi.fn(() => false),
          prepareObject: vi.fn(),
          sendFrameObjectsToBack: vi.fn(),
          setSourceFromObject: vi.fn(),
          syncRuntimeState: vi.fn(),
        } as never,
        reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      })
    ).resolves.toBeNull();

    dependencyMocks.findObjectById.mockReturnValue(null);
    await expect(
      applyRasterBitmapToTarget({
        bitmap,
        context: {
          canvas: canvas as never,
          commitHistory: vi.fn(),
          createLayerMutationToken: vi.fn(() => 1),
          isLayerMutationTokenCurrent: vi.fn(() => true),
          prepareObject: vi.fn(),
          sendFrameObjectsToBack: vi.fn(),
          setSourceFromObject: vi.fn(),
          syncRuntimeState: vi.fn(),
        } as never,
        reference: { kind: 'object', objectId: 'missing', objectName: 'Missing' },
      })
    ).resolves.toBeNull();
  });
});
