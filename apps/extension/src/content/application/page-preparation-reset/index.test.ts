import { expect, it, vi } from 'vitest';

import { clearAllPagePreparationChanges } from './index';

function createDependencies(revisions: number[]) {
  let index = 0;
  const history = {
    clear: vi.fn(),
    getState: vi.fn(() => ({
      canRedo: false,
      canUndo: index < revisions.length - 1,
      revision: revisions[index] ?? 0,
    })),
    undo: vi.fn(() => {
      index = Math.min(index + 1, revisions.length - 1);
    }),
  };
  return {
    clearHighlights: vi.fn(),
    history,
    resetAnnotations: vi.fn(),
  };
}

it('undoes every page preparation change before clearing residual owners', () => {
  const dependencies = createDependencies([3, 4, 5]);

  expect(clearAllPagePreparationChanges(dependencies)).toBe(true);

  expect(dependencies.history.undo).toHaveBeenCalledTimes(2);
  expect(dependencies.clearHighlights).toHaveBeenCalledOnce();
  expect(dependencies.resetAnnotations).toHaveBeenCalledOnce();
  expect(dependencies.history.clear).toHaveBeenCalledOnce();
});

it('stops safely when a history owner cannot make progress and still clears overlays', () => {
  const dependencies = {
    clearHighlights: vi.fn(),
    history: {
      clear: vi.fn(),
      getState: vi.fn(() => ({ canRedo: false, canUndo: true, revision: 7 })),
      undo: vi.fn(),
    },
    resetAnnotations: vi.fn(),
  };

  expect(clearAllPagePreparationChanges(dependencies)).toBe(false);

  expect(dependencies.history.undo).toHaveBeenCalledOnce();
  expect(dependencies.clearHighlights).toHaveBeenCalledOnce();
  expect(dependencies.resetAnnotations).toHaveBeenCalledOnce();
  expect(dependencies.history.clear).toHaveBeenCalledOnce();
});
