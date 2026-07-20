import { expect, it, vi } from 'vitest';
import type { EditorControllerInstance } from '../instance/types';

const helperMocks = vi.hoisted(() => ({
  advanceStepValueForController: vi.fn(),
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

  controller.moveSelection(1);
  expect(controller.nextLabelIndex('rectangle')).toBe(4);
  controller.advanceStepValue();

  expect(helperMocks.moveSelectionForController).toHaveBeenCalledWith(controller, 1);
  expect(helperMocks.nextLabelIndexForController).toHaveBeenCalledWith(controller, 'rectangle');
  expect(helperMocks.advanceStepValueForController).toHaveBeenCalledOnce();
});
