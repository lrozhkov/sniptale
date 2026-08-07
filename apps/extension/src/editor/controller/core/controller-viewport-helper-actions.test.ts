import { expect, it, vi } from 'vitest';
import type { FabricObject } from 'fabric';
import type { EditorControllerInstance } from '../instance/types';

const helperMocks = vi.hoisted(() => ({
  applyGridSnapForController: vi.fn(),
  buildViewportStateForController: vi.fn(() => ({ zoomPercent: 125 })),
  snapExternalEditorRectForController: vi.fn((_, input) => input.rect),
  syncRuntimeStateForController: vi.fn(),
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
  snapExternalEditorRectForController: helperMocks.snapExternalEditorRectForController,
  syncRuntimeStateForController: helperMocks.syncRuntimeStateForController,
}));

import { ImageEditorControllerViewportHelperActions } from './controller-viewport-helper-actions';

class TestViewportHelperActions extends ImageEditorControllerViewportHelperActions {
  protected getControllerInstance(): EditorControllerInstance {
    return this as unknown as EditorControllerInstance;
  }
}

it('delegates viewport helper actions through the controller instance', () => {
  const controller = new TestViewportHelperActions();
  const object = { sniptaleId: 'object' } as FabricObject;

  controller.applyGridSnap(object);
  const rect = { x: 1, y: 2, width: 30, height: 20 };
  expect(controller.snapFrameAnnotationRect({ rect })).toEqual(rect);
  expect(controller.buildViewportState()).toEqual({ zoomPercent: 125 });
  controller.syncRuntimeState();

  expect(helperMocks.applyGridSnapForController).toHaveBeenCalledWith(controller, object);
  expect(helperMocks.buildViewportStateForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.snapExternalEditorRectForController).toHaveBeenCalledWith(controller, {
    rect,
  });
  expect(helperMocks.syncRuntimeStateForController).toHaveBeenCalledWith(controller);
});
