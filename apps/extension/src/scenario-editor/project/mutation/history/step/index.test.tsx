// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  createScenarioNoteStep,
  createScenarioProject,
} from '../../../../../features/scenario/project/public';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import { useScenarioEditorStepHistory } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHarness: ReturnType<typeof createHarnessValue> | null = null;

function createHarnessValue(args: {
  applyStepPatch: (stepId: string, patch: { title?: string }) => void;
  canRedoStep: (stepId: string) => boolean;
  canUndoStep: (stepId: string) => boolean;
  getCurrentProject: () => ScenarioProject | null;
  project: ScenarioProject | null;
  redoStepChange: (stepId: string) => void;
  setProject: React.Dispatch<React.SetStateAction<ScenarioProject | null>>;
  stepHistoryState: unknown;
  undoStepChange: (stepId: string) => void;
}) {
  return args;
}

function StepHistoryHarness(props: { initialProject: ScenarioProject }) {
  const [project, setProject] = useState<ScenarioProject | null>(props.initialProject);
  const history = useScenarioEditorStepHistory({
    project,
    setProject,
    trackProjectMutation: vi.fn(),
  });

  useEffect(() => {
    latestHarness = createHarnessValue({
      applyStepPatch: history.applyStepPatch,
      canRedoStep: history.canRedoStep,
      canUndoStep: history.canUndoStep,
      getCurrentProject: history.getCurrentProject,
      project,
      redoStepChange: history.redoStepChange,
      setProject,
      stepHistoryState: history.stepHistoryState,
      undoStepChange: history.undoStepChange,
    });
  }, [history, project]);

  return null;
}

function createProjectFixture() {
  const project = createScenarioProject('Scenario');
  const noteStep = createScenarioNoteStep({ title: 'First note' });

  return {
    noteStep,
    project: {
      ...project,
      steps: [noteStep],
    },
  };
}

function getHarness() {
  if (!latestHarness) {
    throw new Error('Step history harness is not ready');
  }

  return latestHarness;
}

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderHarness(initialProject: ScenarioProject) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<StepHistoryHarness initialProject={initialProject} />);
    await flushEffects();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestHarness = null;
  vi.unstubAllGlobals();
});

it('applies step patches and restores undo/redo snapshots through the hook facade', async () => {
  const { noteStep, project } = createProjectFixture();
  await renderHarness(project);

  await act(async () => {
    getHarness().applyStepPatch(noteStep.id, { title: 'Updated note' });
    await flushEffects();
  });

  expect(getHarness().project?.steps[0]?.title).toBe('Updated note');
  expect(getHarness().canUndoStep(noteStep.id)).toBe(true);

  await act(async () => {
    getHarness().undoStepChange(noteStep.id);
    await flushEffects();
  });

  expect(getHarness().project?.steps[0]?.title).toBe('First note');
  expect(getHarness().canRedoStep(noteStep.id)).toBe(true);

  await act(async () => {
    getHarness().redoStepChange(noteStep.id);
    await flushEffects();
  });

  expect(getHarness().project?.steps[0]?.title).toBe('Updated note');
  expect(getHarness().getCurrentProject()?.steps[0]?.title).toBe('Updated note');
});

it('clears step history when the project is removed', async () => {
  const { noteStep, project } = createProjectFixture();
  await renderHarness(project);

  await act(async () => {
    getHarness().applyStepPatch(noteStep.id, { title: 'Updated note' });
    await flushEffects();
  });

  expect(getHarness().canUndoStep(noteStep.id)).toBe(true);

  await act(async () => {
    getHarness().setProject(null);
    await flushEffects();
  });

  expect(getHarness().project).toBeNull();
  expect(getHarness().getCurrentProject()).toBeNull();
  expect(getHarness().canUndoStep(noteStep.id)).toBe(false);
  expect(getHarness().stepHistoryState).toEqual({});
});
