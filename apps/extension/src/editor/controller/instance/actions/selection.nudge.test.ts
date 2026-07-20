import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nudgeEditorControllerSelection: vi.fn(() => true),
}));

vi.mock('../../public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api')>()),
  nudgeEditorControllerSelection: mocks.nudgeEditorControllerSelection,
}));

import { finalizeSelectionNudgeForController, nudgeSelectionForController } from './selection';

function createController() {
  return {
    commitHistory: vi.fn(),
    getPublicApiAdapter: vi.fn(() => ({ adapter: true })),
    selectionNudgeSession: null as null | { code: string; step: number },
  };
}

describe('selection nudge controller actions', () => {
  it('finalizes stale nudge sessions and keeps failed nudges out of history', () => {
    const controller = createController();
    controller.selectionNudgeSession = { code: 'ArrowLeft', step: 1 };

    expect(
      nudgeSelectionForController(controller as never, {
        code: 'ArrowRight',
        deltaX: 1,
        deltaY: 0,
        step: 1,
      })
    ).toBe(true);
    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.selectionNudgeSession).toEqual({ code: 'ArrowRight', step: 1 });

    mocks.nudgeEditorControllerSelection.mockReturnValueOnce(false);
    expect(
      nudgeSelectionForController(controller as never, {
        code: 'ArrowRight',
        deltaX: 1,
        deltaY: 0,
        step: 1,
      })
    ).toBe(false);
    finalizeSelectionNudgeForController(controller as never, 'ArrowLeft');
    expect(controller.selectionNudgeSession).toEqual({ code: 'ArrowRight', step: 1 });
    finalizeSelectionNudgeForController(controller as never, 'ArrowRight');
    expect(controller.selectionNudgeSession).toBeNull();
  });
});
