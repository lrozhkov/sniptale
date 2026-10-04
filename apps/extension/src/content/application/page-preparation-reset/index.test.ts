import { expect, it, vi } from 'vitest';

import { clearAllPagePreparationChanges } from './index';

function createDependencies(revisions: number[]) {
  let index = 0;
  const history = {
    clear: vi.fn(),
    hasOpenTransactions: vi.fn(() => false),
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

it('preserves recovery history and residual owners when an undo cannot make progress', () => {
  const dependencies = {
    clearHighlights: vi.fn(),
    history: {
      clear: vi.fn(),
      hasOpenTransactions: vi.fn(() => false),
      getState: vi.fn(() => ({ canRedo: false, canUndo: true, revision: 7 })),
      undo: vi.fn(),
    },
    resetAnnotations: vi.fn(),
  };

  expect(clearAllPagePreparationChanges(dependencies)).toBe(false);

  expect(dependencies.history.undo).toHaveBeenCalledOnce();
  expect(dependencies.clearHighlights).not.toHaveBeenCalled();
  expect(dependencies.resetAnnotations).not.toHaveBeenCalled();
  expect(dependencies.history.clear).not.toHaveBeenCalled();
});

it('preserves pending edits when an owner has not finalized its transaction', () => {
  const dependencies = createDependencies([1]);
  dependencies.history.hasOpenTransactions.mockReturnValue(true);

  expect(clearAllPagePreparationChanges(dependencies)).toBe(false);
  expect(dependencies.history.clear).not.toHaveBeenCalled();
  expect(dependencies.clearHighlights).not.toHaveBeenCalled();
  expect(dependencies.resetAnnotations).not.toHaveBeenCalled();
});
