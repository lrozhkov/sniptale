import { expect, it, vi } from 'vitest';
import type { EditorControllerInstance } from '../instance/types';

const rasterMocks = vi.hoisted(() => ({
  applyRasterBitmapForController: vi.fn(() => Promise.resolve()),
  clearRasterSelectionForController: vi.fn(),
  renderRasterOverlayForController: vi.fn(),
  subscribeRasterOverlayForController: vi.fn(() => vi.fn()),
}));

vi.mock('../instance/bindings', () => ({
  createEditorControllerEventBindings: vi.fn(() => ({})),
  createEditorControllerPublicApiAdapter: vi.fn(() => ({})),
}));

vi.mock('../events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../events')>()),
  createEditorControllerEventHandlers: vi.fn(() => ({})),
}));

vi.mock('../raster-tools/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster-tools/controller')>()),
  applyRasterBitmapForController: rasterMocks.applyRasterBitmapForController,
  clearRasterSelectionForController: rasterMocks.clearRasterSelectionForController,
  renderRasterOverlayForController: rasterMocks.renderRasterOverlayForController,
  subscribeRasterOverlayForController: rasterMocks.subscribeRasterOverlayForController,
}));

import { ImageEditorControllerRasterHelperActions } from './controller-raster-helper-actions';

class TestRasterHelperActions extends ImageEditorControllerRasterHelperActions {
  protected getControllerInstance(): EditorControllerInstance {
    return this as unknown as EditorControllerInstance;
  }
}

it('delegates raster helper actions through the controller instance', async () => {
  const controller = new TestRasterHelperActions();
  const bitmap = {} as HTMLCanvasElement;
  const context = {} as CanvasRenderingContext2D;
  const listener = vi.fn();
  const reference = { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' } as const;

  controller.clearRasterSelection();
  controller.subscribeRasterOverlay(listener);
  controller.renderRasterOverlay(context, { width: 100, height: 50 });
  await controller.applyRasterBitmap(reference, bitmap);

  expect(rasterMocks.clearRasterSelectionForController).toHaveBeenCalledWith(controller);
  expect(rasterMocks.subscribeRasterOverlayForController).toHaveBeenCalledWith(
    controller,
    listener
  );
  expect(rasterMocks.renderRasterOverlayForController).toHaveBeenCalledWith(controller, context, {
    width: 100,
    height: 50,
  });
  expect(rasterMocks.applyRasterBitmapForController).toHaveBeenCalledWith(
    controller,
    reference,
    bitmap
  );
});
