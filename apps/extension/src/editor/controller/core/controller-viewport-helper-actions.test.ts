import { expect, it, vi } from 'vitest';
import type { FabricObject } from 'fabric';
import type { EditorControllerInstance } from '../instance/types';

const helperMocks = vi.hoisted(() => ({
  applyGridSnapForController: vi.fn(),
  buildViewportStateForController: vi.fn(() => ({ zoomPercent: 125 })),
  ensureObjectReachableForController: vi.fn(() => true),
  ensureReachableObjectsForController: vi.fn(() => true),
  focusObjectInViewportForController: vi.fn(),
  scheduleViewportStateSyncForController: vi.fn(),
  scheduleZoomToFitForController: vi.fn(),
  sendFrameObjectsToBackForController: vi.fn(),
  snapExternalEditorRectForController: vi.fn((_, input) => input.rect),
  snapExternalEditorResizeRectForController: vi.fn((_, input) => input.rect),
  syncRuntimeStateForController: vi.fn(),
  syncViewportStateForController: vi.fn(),
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
  ensureObjectReachableForController: helperMocks.ensureObjectReachableForController,
  ensureReachableObjectsForController: helperMocks.ensureReachableObjectsForController,
  focusObjectInViewportForController: helperMocks.focusObjectInViewportForController,
  scheduleViewportStateSyncForController: helperMocks.scheduleViewportStateSyncForController,
  scheduleZoomToFitForController: helperMocks.scheduleZoomToFitForController,
  sendFrameObjectsToBackForController: helperMocks.sendFrameObjectsToBackForController,
  snapExternalEditorRectForController: helperMocks.snapExternalEditorRectForController,
  snapExternalEditorResizeRectForController: helperMocks.snapExternalEditorResizeRectForController,
  syncRuntimeStateForController: helperMocks.syncRuntimeStateForController,
  syncViewportStateForController: helperMocks.syncViewportStateForController,
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
  expect(
    controller.snapFrameAnnotationResizeRect({ direction: 'se', minimumSize: 8, rect })
  ).toEqual(rect);
  expect(controller.buildViewportState()).toEqual({ zoomPercent: 125 });
  controller.syncViewportState();
  controller.scheduleViewportStateSync();
  expect(controller.ensureObjectReachable(object)).toBe(true);
  expect(controller.ensureReachableObjects()).toBe(true);
  controller.focusObjectInViewport(object);
  controller.scheduleZoomToFit();
  controller.syncRuntimeState();
  controller.clearFrameAnnotationSnap();

  expect(helperMocks.applyGridSnapForController).toHaveBeenCalledWith(controller, object);
  expect(helperMocks.buildViewportStateForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.snapExternalEditorRectForController).toHaveBeenCalledWith(controller, {
    rect,
  });
  expect(helperMocks.snapExternalEditorResizeRectForController).toHaveBeenCalledWith(controller, {
    direction: 'se',
    minimumSize: 8,
    rect,
  });
  expect(helperMocks.syncRuntimeStateForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.syncViewportStateForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.scheduleViewportStateSyncForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.ensureObjectReachableForController).toHaveBeenCalledWith(controller, object);
  expect(helperMocks.ensureReachableObjectsForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.focusObjectInViewportForController).toHaveBeenCalledWith(controller, object);
  expect(helperMocks.scheduleZoomToFitForController).toHaveBeenCalledWith(controller);
});
