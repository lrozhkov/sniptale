import { expect, it, vi } from 'vitest';
import { FabricObject, Point } from 'fabric';
import type { EditorControllerInstance } from '../instance/types';

const helperMocks = vi.hoisted(() => ({
  advanceStepValueForController: vi.fn(),
  cancelTransientInteractionForController: vi.fn(() => true),
  startDrawSessionForController: vi.fn(),
  getActiveCropRectForController: vi.fn(() => null),
  addObjectForController: vi.fn(),
  moveSelectionToEdgeForController: vi.fn(),
  withHistoryMutedForController: vi.fn((_controller, callback: () => unknown) => callback()),
  commitHistoryForController: vi.fn(),
  applyToolModeForController: vi.fn(),
  refreshActiveToolSettingsPreviewForController: vi.fn(),
  switchToSelectToolForController: vi.fn(),
  moveSelectionForController: vi.fn(),
  nextLabelIndexForController: vi.fn(() => 4),
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
  advanceStepValueForController: helperMocks.advanceStepValueForController,
  cancelTransientInteractionForController: helperMocks.cancelTransientInteractionForController,
  startDrawSessionForController: helperMocks.startDrawSessionForController,
  getActiveCropRectForController: helperMocks.getActiveCropRectForController,
  addObjectForController: helperMocks.addObjectForController,
  moveSelectionToEdgeForController: helperMocks.moveSelectionToEdgeForController,
  withHistoryMutedForController: helperMocks.withHistoryMutedForController,
  commitHistoryForController: helperMocks.commitHistoryForController,
  applyToolModeForController: helperMocks.applyToolModeForController,
  refreshActiveToolSettingsPreviewForController:
    helperMocks.refreshActiveToolSettingsPreviewForController,
  switchToSelectToolForController: helperMocks.switchToSelectToolForController,
  moveSelectionForController: helperMocks.moveSelectionForController,
  nextLabelIndexForController: helperMocks.nextLabelIndexForController,
}));

import { ImageEditorControllerInteractionHelperActions } from './controller-interaction-helper-actions';

class TestInteractionHelperActions extends ImageEditorControllerInteractionHelperActions {
  protected getControllerInstance(): EditorControllerInstance {
    return this as unknown as EditorControllerInstance;
  }
}

it('delegates interaction and tool helper actions through the controller instance', () => {
  const controller = new TestInteractionHelperActions();
  const object = new FabricObject();
  const point = new Point(1, 2);

  controller.startDrawSession('shape', point, object);
  controller.startDrawSession('shape', point, object, 7);
  expect(controller.getActiveCropRect()).toBeNull();
  controller.addObject(object);
  controller.moveSelectionToEdge('front');
  expect(controller.withHistoryMuted(() => 7)).toBe(7);
  controller.commitHistory();
  controller.applyToolMode();
  controller.refreshActiveToolSettingsPreview();
  controller.switchToSelectTool();

  expect(helperMocks.startDrawSessionForController).toHaveBeenNthCalledWith(
    1,
    controller,
    'shape',
    point,
    object,
    null
  );
  expect(helperMocks.startDrawSessionForController).toHaveBeenNthCalledWith(
    2,
    controller,
    'shape',
    point,
    object,
    7
  );
  expect(helperMocks.getActiveCropRectForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.addObjectForController).toHaveBeenCalledWith(controller, object);
  expect(helperMocks.moveSelectionToEdgeForController).toHaveBeenCalledWith(controller, 'front');
  expect(helperMocks.commitHistoryForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.applyToolModeForController).toHaveBeenCalledWith(controller);
  expect(helperMocks.refreshActiveToolSettingsPreviewForController).toHaveBeenCalledWith(
    controller
  );
  expect(helperMocks.switchToSelectToolForController).toHaveBeenCalledWith(controller);

  controller.moveSelection(1);
  expect(controller.nextLabelIndex('shape')).toBe(4);
  controller.advanceStepValue();
  expect(controller.cancelTransientInteraction('window-blur')).toBe(true);
  expect(controller.cancelTransientInteraction()).toBe(true);
  expect(helperMocks.cancelTransientInteractionForController).toHaveBeenNthCalledWith(
    1,
    controller,
    'window-blur'
  );
  expect(helperMocks.cancelTransientInteractionForController).toHaveBeenNthCalledWith(
    2,
    controller,
    undefined
  );

  expect(helperMocks.moveSelectionForController).toHaveBeenCalledWith(controller, 1);
  expect(helperMocks.nextLabelIndexForController).toHaveBeenCalledWith(controller, 'shape');
  expect(helperMocks.advanceStepValueForController).toHaveBeenCalledOnce();
});
