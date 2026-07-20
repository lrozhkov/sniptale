import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ScenarioNoteStep,
  ScenarioProject,
} from '../../../../../features/scenario/contracts/types/project';
import {
  applyStepReplacementToProject,
  applySingleStepPatchToProject,
  applyStepPatchBatchToProject,
  restoreScenarioStepHistoryChange,
} from './helpers';

function createStep(id = 'step-1', title = 'Step 1'): ScenarioNoteStep {
  return {
    id,
    kind: 'note',
    title,
    body: 'Body',
    tone: 'neutral',
    createdAt: 1,
    updatedAt: 1,
  };
}

function createProject(): ScenarioProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project 1',
    createdAt: 1,
    updatedAt: 1,
    steps: [createStep('step-1', 'Step 1'), createStep('step-2', 'Step 2')],
    suggestedEvents: [],
    trash: [],
  };
}

function registerStepHistoryHelperFixtures() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(500);
  });
}

function verifiesSinglePatchFlow() {
  it('applies a single step patch and records the previous step in history', () => {
    const commitProjectState = vi.fn();

    applySingleStepPatchToProject({
      commitProjectState,
      patch: { title: 'Updated step' },
      project: createProject(),
      stepHistoryState: {},
      stepId: 'step-1',
    });

    expect(commitProjectState).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAt: 500,
        steps: [
          expect.objectContaining({ id: 'step-1', title: 'Updated step' }),
          expect.objectContaining({ id: 'step-2', title: 'Step 2' }),
        ],
      }),
      {
        'step-1': {
          future: [],
          past: [expect.objectContaining({ id: 'step-1', title: 'Step 1' })],
        },
      }
    );
  });
}

function verifiesSinglePatchGuards() {
  it('skips single-step commits for empty patches and missing steps', () => {
    const commitProjectState = vi.fn();
    const project = createProject();

    applySingleStepPatchToProject({
      commitProjectState,
      patch: {},
      project,
      stepHistoryState: {},
      stepId: 'step-1',
    });
    applySingleStepPatchToProject({
      commitProjectState,
      patch: { title: 'Updated step' },
      project,
      stepHistoryState: {},
      stepId: 'missing-step',
    });

    expect(commitProjectState).not.toHaveBeenCalled();
  });
}

function verifiesPatchBatchFlow() {
  it('applies patch batches while skipping empty and missing items', () => {
    const commitProjectState = vi.fn();

    applyStepPatchBatchToProject({
      commitProjectState,
      patches: [
        { stepId: 'step-1', patch: { title: 'First updated' } },
        { stepId: 'step-2', patch: {} },
        { stepId: 'missing-step', patch: { title: 'Ignored' } },
      ],
      project: createProject(),
      stepHistoryState: {},
    });

    expect(commitProjectState).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAt: 500,
        steps: [
          expect.objectContaining({ id: 'step-1', title: 'First updated' }),
          expect.objectContaining({ id: 'step-2', title: 'Step 2' }),
        ],
      }),
      {
        'step-1': {
          future: [],
          past: [expect.objectContaining({ id: 'step-1', title: 'Step 1' })],
        },
      }
    );
  });
}

function verifiesStepReplacementFlow() {
  it('replaces a step through the dedicated history seam without widening step patches', () => {
    const commitProjectState = vi.fn();

    applyStepReplacementToProject({
      commitProjectState,
      project: createProject(),
      replaceStep: (step) => ({ ...step, title: 'Replaced title' }),
      stepHistoryState: {},
      stepId: 'step-1',
    });

    expect(commitProjectState).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [
          expect.objectContaining({ id: 'step-1', title: 'Replaced title' }),
          expect.objectContaining({ id: 'step-2', title: 'Step 2' }),
        ],
      }),
      {
        'step-1': {
          future: [],
          past: [expect.objectContaining({ id: 'step-1', title: 'Step 1' })],
        },
      }
    );
  });
}

function expectUndoCommit(commitProjectState: ReturnType<typeof vi.fn>) {
  expect(commitProjectState).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      steps: [
        expect.objectContaining({ id: 'step-1', title: 'Previous title' }),
        expect.objectContaining({ id: 'step-2', title: 'Step 2' }),
      ],
    }),
    {
      'step-1': {
        future: [expect.objectContaining({ id: 'step-1', title: 'Step 1' })],
        past: [],
      },
    }
  );
}

function expectRedoCommit(commitProjectState: ReturnType<typeof vi.fn>) {
  expect(commitProjectState).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      steps: [
        expect.objectContaining({ id: 'step-1', title: 'Redo title' }),
        expect.objectContaining({ id: 'step-2', title: 'Step 2' }),
      ],
    }),
    {
      'step-1': {
        future: [],
        past: [expect.objectContaining({ id: 'step-1', title: 'Step 1' })],
      },
    }
  );
}

function verifiesRestoreFlow() {
  it('restores undo and redo snapshots when history entries exist', () => {
    const commitProjectState = vi.fn();
    const project = createProject();

    restoreScenarioStepHistoryChange({
      commitProjectState,
      mode: 'undo',
      project,
      stepHistoryState: {
        'step-1': {
          future: [],
          past: [createStep('step-1', 'Previous title')],
        },
      },
      stepId: 'step-1',
    });

    restoreScenarioStepHistoryChange({
      commitProjectState,
      mode: 'redo',
      project,
      stepHistoryState: {
        'step-1': {
          future: [createStep('step-1', 'Redo title')],
          past: [],
        },
      },
      stepId: 'step-1',
    });

    expectUndoCommit(commitProjectState);
    expectRedoCommit(commitProjectState);
  });
}

function verifiesRestoreGuard() {
  it('skips restore commits when history has no matching entry', () => {
    const commitProjectState = vi.fn();

    restoreScenarioStepHistoryChange({
      commitProjectState,
      mode: 'undo',
      project: createProject(),
      stepHistoryState: {},
      stepId: 'step-1',
    });

    expect(commitProjectState).not.toHaveBeenCalled();
  });
}

function runScenarioEditorStepHistoryHelpersSuite() {
  registerStepHistoryHelperFixtures();
  verifiesSinglePatchFlow();
  verifiesSinglePatchGuards();
  verifiesPatchBatchFlow();
  verifiesStepReplacementFlow();
  verifiesRestoreFlow();
  verifiesRestoreGuard();
}

describe('scenario editor step history helpers', runScenarioEditorStepHistoryHelpersSuite);
