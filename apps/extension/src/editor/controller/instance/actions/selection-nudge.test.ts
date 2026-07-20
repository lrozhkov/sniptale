import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nudgeEditorControllerSelection: vi.fn(),
}));

vi.mock('../../public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api')>()),
  nudgeEditorControllerSelection: mocks.nudgeEditorControllerSelection,
}));

import { finalizeSelectionNudgeForController, nudgeSelectionForController } from './selection';

function createController() {
  return {
    getPublicApiAdapter: vi.fn(() => ({ id: 'adapter' })),
    commitHistory: vi.fn(),
    selectionNudgeSession: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('keeps nudge sessions stable across no-op and mismatched finalize calls', () => {
  const controller = createController();
  const typedController = controller as never;

  mocks.nudgeEditorControllerSelection.mockReturnValueOnce(false);
  expect(
    nudgeSelectionForController(typedController, {
      code: 'ArrowRight',
      deltaX: 1,
      deltaY: 0,
      step: 1,
    })
  ).toBe(false);
  expect(controller.selectionNudgeSession).toBeNull();

  mocks.nudgeEditorControllerSelection.mockReturnValue(true);
  expect(
    nudgeSelectionForController(typedController, {
      code: 'ArrowRight',
      deltaX: 1,
      deltaY: 0,
      step: 1,
    })
  ).toBe(true);
  finalizeSelectionNudgeForController(typedController, 'ArrowLeft');
  expect(controller.commitHistory).not.toHaveBeenCalled();
  finalizeSelectionNudgeForController(typedController);
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});
