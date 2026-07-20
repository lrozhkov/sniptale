// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact controller proof keeps clear, subscribe, render, and apply contracts together */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyRasterBitmapToTarget: vi.fn(async (_args: unknown): Promise<unknown> => null),
  buildRasterizedSourceState: vi.fn((_source, object) => ({ nextSourceFrom: object })),
  clearEditorRasterSelection: vi.fn(),
  copyRasterSelectionToClipboard: vi.fn(async () => true),
  cutRasterSelectionToClipboard: vi.fn(async () => true),
  deleteRasterSelectionPixels: vi.fn(async (_adapter: unknown) => true),
  pasteRasterClipboardImage: vi.fn(async () => true),
  renderEditorRasterOverlay: vi.fn(),
  subscribeEditorRasterOverlay: vi.fn((_session, listener: () => void) => {
    listener();
    return () => undefined;
  }),
}));

vi.mock('../layer-effects/rasterize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layer-effects/rasterize')>()),
  buildRasterizedSourceState: mocks.buildRasterizedSourceState,
}));

vi.mock('../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object')>()),
  applyRasterBitmapToTarget: mocks.applyRasterBitmapToTarget,
}));

vi.mock('./overlay', () => ({
  renderEditorRasterOverlay: mocks.renderEditorRasterOverlay,
}));

vi.mock('./session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session')>()),
  clearEditorRasterSelection: mocks.clearEditorRasterSelection,
  subscribeEditorRasterOverlay: mocks.subscribeEditorRasterOverlay,
}));

vi.mock('./clipboard', () => ({
  copyRasterSelectionToClipboard: mocks.copyRasterSelectionToClipboard,
  cutRasterSelectionToClipboard: mocks.cutRasterSelectionToClipboard,
  deleteRasterSelectionPixels: mocks.deleteRasterSelectionPixels,
  pasteRasterClipboardImage: mocks.pasteRasterClipboardImage,
}));

import {
  applyRasterBitmapForController,
  clearRasterSelectionForController,
  copyRasterSelectionForController,
  cutRasterSelectionForController,
  deleteRasterSelectionForController,
  pasteRasterClipboardForController,
  renderRasterOverlayForController,
  subscribeRasterOverlayForController,
} from './controller';

function createController() {
  return {
    canvas: { id: 'canvas' },
    commitHistory: vi.fn(),
    layerMutationToken: 3,
    nextLabelIndex: vi.fn(() => 8),
    prepareObject: vi.fn(),
    rasterToolSession: { id: 'session' },
    sendFrameObjectsToBack: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}

describe('editor-controller/raster-tools/controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears and subscribes raster overlay state through session owners', () => {
    const controller = createController();
    const listener = vi.fn();

    clearRasterSelectionForController(controller as never);
    const unsubscribe = subscribeRasterOverlayForController(controller as never, listener);

    expect(mocks.clearEditorRasterSelection).toHaveBeenCalledWith(controller.rasterToolSession);
    expect(mocks.subscribeEditorRasterOverlay).toHaveBeenCalledWith(
      controller.rasterToolSession,
      listener
    );
    expect(listener).toHaveBeenCalledOnce();
    expect(unsubscribe).toEqual(expect.any(Function));
  });

  it('renders overlays and forwards bitmap application through the raster mutation owner', async () => {
    const controller = createController();
    const bitmap = document.createElement('canvas');
    const replacement = { id: 'replacement' };

    mocks.applyRasterBitmapToTarget.mockImplementationOnce(async (args: unknown) => {
      const { context } = args as {
        context: {
          commitHistory: () => void;
          createLayerMutationToken: () => number;
          isLayerMutationTokenCurrent: (token: number) => boolean;
          prepareObject: (object: unknown) => void;
          sendFrameObjectsToBack: () => void;
          setSourceFromObject: (object: unknown) => void;
          syncRuntimeState: () => void;
        };
      };
      const token = context.createLayerMutationToken();
      expect(token).toBe(4);
      expect(context.isLayerMutationTokenCurrent(token)).toBe(true);
      context.setSourceFromObject(replacement);
      context.prepareObject(replacement as never);
      context.sendFrameObjectsToBack();
      context.commitHistory();
      context.syncRuntimeState();
      return replacement;
    });

    renderRasterOverlayForController(controller as never, {} as CanvasRenderingContext2D, {
      width: 120,
      height: 80,
    });
    await applyRasterBitmapForController(
      controller as never,
      { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
      bitmap
    );

    expect(mocks.renderEditorRasterOverlay).toHaveBeenCalledWith({
      canvas: controller.canvas,
      context: {},
      session: controller.rasterToolSession,
      size: { width: 120, height: 80 },
    });
    expect(mocks.buildRasterizedSourceState).toHaveBeenCalledWith({ id: 'source' }, replacement);
    expect(controller.source).toEqual({ nextSourceFrom: replacement });
    expect(controller.layerMutationToken).toBe(4);
    expect(controller.prepareObject).toHaveBeenCalledWith(replacement);
    expect(controller.sendFrameObjectsToBack).toHaveBeenCalledOnce();
    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('forwards raster clipboard commands through a controller-local adapter', async () => {
    const controller = createController();
    const bitmap = document.createElement('canvas');
    mocks.deleteRasterSelectionPixels.mockImplementationOnce(async (adapter: unknown) => {
      await (
        adapter as {
          applyRasterBitmap: (
            reference: { kind: 'object'; objectId: string; objectName: string },
            bitmap: HTMLCanvasElement
          ) => Promise<void>;
        }
      ).applyRasterBitmap({ kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' }, bitmap);
      return true;
    });

    await expect(copyRasterSelectionForController(controller as never)).resolves.toBe(true);
    await expect(cutRasterSelectionForController(controller as never)).resolves.toBe(true);
    await expect(deleteRasterSelectionForController(controller as never)).resolves.toBe(true);
    await expect(pasteRasterClipboardForController(controller as never)).resolves.toBe(true);

    expect(mocks.copyRasterSelectionToClipboard).toHaveBeenCalledWith(
      expect.objectContaining({ canvas: controller.canvas })
    );
    expect(mocks.cutRasterSelectionToClipboard).toHaveBeenCalledWith(
      expect.objectContaining({ rasterToolSession: controller.rasterToolSession })
    );
    expect(mocks.deleteRasterSelectionPixels).toHaveBeenCalledWith(
      expect.objectContaining({ applyRasterBitmap: expect.any(Function) })
    );
    expect(mocks.applyRasterBitmapToTarget).toHaveBeenCalled();
    expect(mocks.pasteRasterClipboardImage).toHaveBeenCalledWith(
      expect.objectContaining({ source: controller.source })
    );
  });
});
