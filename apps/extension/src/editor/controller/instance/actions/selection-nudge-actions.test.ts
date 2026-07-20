import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nudgeEditorControllerSelection: vi.fn(() => true),
}));

vi.mock('../../public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api')>()),
  nudgeEditorControllerSelection: mocks.nudgeEditorControllerSelection,
}));

import {
  finalizeSelectionNudgeForController,
  nudgeSelectionForController,
} from './selection-nudge-actions';

function createController() {
  return {
    commitHistory: vi.fn(),
    getPublicApiAdapter: vi.fn(() => ({ id: 'adapter' })),
    selectionNudgeSession: null as null | { code: 'ArrowLeft' | 'ArrowRight'; step: number },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nudgeEditorControllerSelection.mockReturnValue(true);
});

it('owns nudge session authority and finalization', () => {
  const controller = createController();

  expect(
    nudgeSelectionForController(controller as never, {
      code: 'ArrowLeft',
      deltaX: -1,
      deltaY: 0,
      step: 1,
    })
  ).toBe(true);
  expect(controller.selectionNudgeSession).toEqual({ code: 'ArrowLeft', step: 1 });

  finalizeSelectionNudgeForController(controller as never, 'ArrowRight');
  expect(controller.commitHistory).not.toHaveBeenCalled();
  expect(controller.selectionNudgeSession).toEqual({ code: 'ArrowLeft', step: 1 });

  finalizeSelectionNudgeForController(controller as never, 'ArrowLeft');
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.selectionNudgeSession).toBeNull();
});

it('finalizes stale sessions before a different nudge signature', () => {
  const controller = createController();
  controller.selectionNudgeSession = { code: 'ArrowLeft', step: 1 };

  nudgeSelectionForController(controller as never, {
    code: 'ArrowRight',
    deltaX: 5,
    deltaY: 0,
    step: 5,
  });

  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.selectionNudgeSession).toEqual({ code: 'ArrowRight', step: 5 });
});
