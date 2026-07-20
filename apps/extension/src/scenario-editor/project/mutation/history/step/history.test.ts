import { describe, expect, it } from 'vitest';
import type { ScenarioStep } from '../../../../../features/scenario/contracts/types/project';

import {
  canRedoScenarioStep,
  canUndoScenarioStep,
  consumeScenarioStepRedo,
  consumeScenarioStepUndo,
  pruneScenarioStepHistory,
  pushScenarioStepHistory,
} from './history';

function createStep(id: string, title: string): ScenarioStep {
  return { id, kind: 'note', title, body: '', createdAt: 1, tone: 'neutral', updatedAt: 1 };
}

function expectPushAndPruneHistory() {
  const state = pushScenarioStepHistory({}, createStep('step-1', 'First'));
  const pruned = pruneScenarioStepHistory(
    {
      ...state,
      'step-2': { past: [createStep('step-2', 'Second')], future: [] },
    },
    ['step-1']
  );

  expect(canUndoScenarioStep(state, 'step-1')).toBe(true);
  expect(pruned).toEqual({
    'step-1': expect.objectContaining({
      past: [expect.objectContaining({ title: 'First' })],
    }),
  });
}

function expectUndoAndRedoHistory() {
  const currentStep = createStep('step-1', 'Current');
  const previousStep = createStep('step-1', 'Previous');
  const futureStep = createStep('step-1', 'Future');

  const undoResult = consumeScenarioStepUndo({
    currentStep,
    historyState: {
      'step-1': {
        past: [previousStep],
        future: [],
      },
    },
  });
  const redoResult = consumeScenarioStepRedo({
    currentStep,
    historyState: {
      'step-1': {
        past: [],
        future: [futureStep],
      },
    },
  });

  expect(undoResult.restoredStep?.title).toBe('Previous');
  expect(canRedoScenarioStep(undoResult.historyState, 'step-1')).toBe(true);
  expect(redoResult.restoredStep?.title).toBe('Future');
  expect(canUndoScenarioStep(redoResult.historyState, 'step-1')).toBe(true);
}

function expectDetachedSnapshots() {
  const step = createStep('step-1', 'Original');
  const state = pushScenarioStepHistory({}, step);

  step.title = 'Mutated';

  const undoResult = consumeScenarioStepUndo({
    currentStep: createStep('step-1', 'Current'),
    historyState: state,
  });

  expect(state['step-1']?.past[0]?.title).toBe('Original');
  expect(undoResult.restoredStep?.title).toBe('Original');
}

describe('scenario step history', () => {
  it('pushes history entries and prunes unknown steps', expectPushAndPruneHistory);
  it('consumes undo and redo history entries', expectUndoAndRedoHistory);
  it('stores and restores detached step snapshots', expectDetachedSnapshots);
});
