import { expect, it, vi } from 'vitest';
import type { FabricObject } from 'fabric';
import type { EditorControllerInstance } from '../instance/types';

const helperMocks = vi.hoisted(() => ({
  applyGridSnapForController: vi.fn(),
  buildViewportStateForController: vi.fn(() => ({ zoomPercent: 100 })),
  clearRasterSelectionForController: vi.fn(),
  nextLabelIndexForController: vi.fn(() => 3),
}));

vi.mock('../instance/bindings', () => ({
  createEditorControllerEventBindings: vi.fn(() => ({})),
  createEditorControllerPublicApiAdapter: vi.fn(() => ({})),
}));

vi.mock('../events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../events')>()),
  createEditorControllerEventHandlers: vi.fn(() => ({})),
}));

vi.mock('../instance/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../instance/helpers')>()),
  applyGridSnapForController: helperMocks.applyGridSnapForController,
  buildViewportStateForController: helperMocks.buildViewportStateForController,
  nextLabelIndexForController: helperMocks.nextLabelIndexForController,
}));

vi.mock('../raster-tools/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster-tools/controller')>()),
  clearRasterSelectionForController: helperMocks.clearRasterSelectionForController,
}));

import { ImageEditorControllerHelperActions } from './controller-helper-actions';

class TestControllerHelperActions extends ImageEditorControllerHelperActions {
  protected getControllerInstance(): EditorControllerInstance {
    return this as unknown as EditorControllerInstance;
  }
}

it('delegates helper actions through the current controller instance', () => {
  const controller = new TestControllerHelperActions();
  const object = { sniptaleId: 'object-1' } as FabricObject;

  controller.applyGridSnap(object);
  expect(controller.buildViewportState()).toEqual({ zoomPercent: 100 });
  expect(controller.nextLabelIndex('rectangle')).toBe(3);
  controller.clearRasterSelection();

  expect(helperMocks.applyGridSnapForController).toHaveBeenCalledWith(controller, object);
  expect(helperMocks.buildViewportStateForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.nextLabelIndexForController).toHaveBeenCalledWith(controller, 'rectangle');
  expect(helperMocks.clearRasterSelectionForController).toHaveBeenCalledWith(controller);
});
