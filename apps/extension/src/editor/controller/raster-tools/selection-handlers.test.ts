// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact selection workflow proof keeps marquee, lasso, and wand ownership together */
import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { createEditorRasterToolSession } from './session';

const mocks = vi.hoisted(() => ({
  createRasterTargetSnapshot: vi.fn(),
  createSelectionMaskForSnapshot: vi.fn((snapshot) => {
    const canvas = document.createElement('canvas');
    canvas.width = snapshot.bitmap.width;
    canvas.height = snapshot.bitmap.height;
    return canvas;
  }),
  finalizeSelectionMask: vi.fn(() => true),
  notifyEditorRasterOverlay: vi.fn(),
  replaceRasterMaskWithFloodSelection: vi.fn(),
  replaceRasterMaskWithPolygon: vi.fn(),
  replaceRasterMaskWithRect: vi.fn(),
  resolveBitmapPoint: vi.fn(() => ({ x: 4, y: 5 })),
  resolveRasterOverlayObject: vi.fn(() => ({ id: 'object' })),
  resolveRasterTarget: vi.fn(),
}));

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    createSelectionMaskForSnapshot: mocks.createSelectionMaskForSnapshot,
    finalizeSelectionMask: mocks.finalizeSelectionMask,
  };
});

vi.mock('./session', async () => {
  const actual = await vi.importActual<typeof import('./session')>('./session');
  return {
    ...actual,
    notifyEditorRasterOverlay: mocks.notifyEditorRasterOverlay,
  };
});

vi.mock('../raster/selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/selection')>()),
  replaceRasterMaskWithFloodSelection: mocks.replaceRasterMaskWithFloodSelection,
  replaceRasterMaskWithPolygon: mocks.replaceRasterMaskWithPolygon,
  replaceRasterMaskWithRect: mocks.replaceRasterMaskWithRect,
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  createRasterTargetSnapshot: mocks.createRasterTargetSnapshot,
  resolveBitmapPoint: mocks.resolveBitmapPoint,
  resolveRasterTarget: mocks.resolveRasterTarget,
}));

vi.mock('../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

import {
  finalizeLassoDraft,
  finalizeMarqueeDraft,
  handleSelectionMouseDown,
  updateLassoDraft,
  updateMarqueeDraft,
} from './selection';

describe('editor-controller/raster-tools/selection handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({
      rasterToolSettings: {
        ...useEditorStore.getState().rasterToolSettings,
        selectionMode: 'marquee',
      },
    } as never);
    mocks.resolveRasterTarget.mockReturnValue({
      kind: 'object',
      object: { id: 'object' },
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    });
    const bitmap = document.createElement('canvas');
    bitmap.width = 20;
    bitmap.height = 20;
    vi.spyOn(bitmap, 'getContext').mockReturnValue({
      getImageData: vi.fn(
        () =>
          ({
            data: new Uint8ClampedArray(20 * 20 * 4),
            height: 20,
            width: 20,
          }) as ImageData
      ),
    } as unknown as CanvasRenderingContext2D);
    mocks.createRasterTargetSnapshot.mockResolvedValue({
      bitmap,
      reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      sceneBounds: { left: 0, top: 0, width: 20, height: 20 },
    });
  });

  it('starts and finalizes marquee, lasso, and wand selections', async () => {
    const session = createEditorRasterToolSession();
    const bindings = { getCanvas: () => null, getRasterToolSession: () => session };
    const canvas = { id: 'canvas' };

    await handleSelectionMouseDown(bindings as never, canvas as never, new Point(1, 2));
    expect(session.marqueeDraft).not.toBeNull();
    updateMarqueeDraft(session, canvas as never, null, new Point(4, 5));
    finalizeMarqueeDraft(session);
    expect(mocks.replaceRasterMaskWithRect).toHaveBeenCalledOnce();

    useEditorStore.setState({
      rasterToolSettings: {
        ...useEditorStore.getState().rasterToolSettings,
        selectionMode: 'lasso',
      },
    } as never);
    await handleSelectionMouseDown(bindings as never, canvas as never, new Point(1, 2));
    updateLassoDraft(session, canvas as never, null, new Point(6, 7));
    finalizeLassoDraft(session);
    expect(mocks.replaceRasterMaskWithPolygon).toHaveBeenCalledOnce();

    useEditorStore.setState({
      rasterToolSettings: {
        ...useEditorStore.getState().rasterToolSettings,
        selectionMode: 'wand',
      },
    } as never);
    await handleSelectionMouseDown(bindings as never, canvas as never, new Point(1, 2));
    expect(mocks.replaceRasterMaskWithFloodSelection).toHaveBeenCalledOnce();
  });

  it('resolves raster selection only from the active layer authority', async () => {
    const session = createEditorRasterToolSession();
    const bindings = { getCanvas: () => null, getRasterToolSession: () => session };
    const canvas = { id: 'canvas' };

    await handleSelectionMouseDown(bindings as never, canvas as never, new Point(1, 2));

    expect(mocks.resolveRasterTarget).toHaveBeenCalledWith({ canvas });
  });

  it('passes the pointer target through raster selection resolution', async () => {
    const session = createEditorRasterToolSession();
    const bindings = { getCanvas: () => null, getRasterToolSession: () => session };
    const canvas = { id: 'canvas' };
    const fallbackTarget = { sniptaleId: 'pointer-layer' };

    await handleSelectionMouseDown(
      bindings as never,
      canvas as never,
      new Point(1, 2),
      fallbackTarget as never
    );

    expect(mocks.resolveRasterTarget).toHaveBeenCalledWith({ canvas, fallbackTarget });
  });
});
