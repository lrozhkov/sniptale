// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
  createScenarioProject,
} from '../../../../../features/scenario/project/public';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import { useScenarioEditorProjectHistory } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHarness: ReturnType<typeof createHarnessValue> | null = null;

function createHarnessValue(args: {
  canRedoProject: boolean;
  canUndoProject: boolean;
  project: ScenarioProject | null;
  quickEditStepId: string | null;
  redoProjectChange: () => void;
  selectedStepId: string | null;
  setProject: React.Dispatch<React.SetStateAction<ScenarioProject | null>>;
  setQuickEditStepId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedStepId: React.Dispatch<React.SetStateAction<string | null>>;
  trackProjectMutation: () => void;
  undoProjectChange: () => void;
}) {
  return args;
}

function ProjectHistoryHarness(props: { initialProject: ScenarioProject }) {
  const [project, setProject] = useState<ScenarioProject | null>(props.initialProject);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    props.initialProject.steps[0]?.id ?? null
  );
  const [quickEditStepId, setQuickEditStepId] = useState<string | null>(
    props.initialProject.steps[0]?.id ?? null
  );
  const history = useScenarioEditorProjectHistory({
    project,
    quickEditStepId,
    selectedStepId,
    setProject,
    setQuickEditStepId,
    setSelectedStepId,
  });

  useEffect(() => {
    latestHarness = createHarnessValue({
      canRedoProject: history.canRedoProject,
      canUndoProject: history.canUndoProject,
      project,
      quickEditStepId,
      redoProjectChange: history.redoProjectChange,
      selectedStepId,
      setProject,
      setQuickEditStepId,
      setSelectedStepId,
      trackProjectMutation: history.trackProjectMutation,
      undoProjectChange: history.undoProjectChange,
    });
  }, [
    history.canRedoProject,
    history.canUndoProject,
    history.redoProjectChange,
    history.trackProjectMutation,
    history.undoProjectChange,
    project,
    quickEditStepId,
    selectedStepId,
    setProject,
    setQuickEditStepId,
    setSelectedStepId,
  ]);

  return null;
}

function createProjectFixture() {
  const project = createScenarioProject('Scenario');
  const captureStep = createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture' });
  const noteStep = createScenarioNoteStep({ title: 'Note' });

  return {
    captureStep,
    noteStep,
    project: {
      ...project,
      updatedAt: 10,
      steps: [captureStep, noteStep],
    },
  };
}

function getHarness() {
  if (!latestHarness) {
    throw new Error('Project history harness is not ready');
  }

  return latestHarness;
}

async function flushEffects() {
  await Promise.resolve();
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
    root?.render(<ProjectHistoryHarness initialProject={initialProject} />);
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

it('undoes and redoes project snapshots while preserving selected and quick-edit steps', async () => {
  const { captureStep, noteStep, project } = createProjectFixture();
  await renderHarness(project);

  expect(getHarness().canUndoProject).toBe(false);

  await act(async () => {
    getHarness().setSelectedStepId(noteStep.id);
    getHarness().setQuickEditStepId(captureStep.id);
    await flushEffects();
  });

  await act(async () => {
    getHarness().trackProjectMutation();
    getHarness().setProject((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        updatedAt: 20,
        steps: [captureStep],
      };
    });
    await flushEffects();
  });

  expect(getHarness().canUndoProject).toBe(true);
  expect(getHarness().selectedStepId).toBe(noteStep.id);

  await act(async () => {
    getHarness().undoProjectChange();
    await flushEffects();
  });

  expect(getHarness().project?.steps.map((step) => step.id)).toEqual([captureStep.id, noteStep.id]);
  expect(getHarness().selectedStepId).toBe(noteStep.id);
  expect(getHarness().quickEditStepId).toBe(captureStep.id);
  expect(getHarness().canRedoProject).toBe(true);

  await act(async () => {
    getHarness().redoProjectChange();
    await flushEffects();
  });

  expect(getHarness().project?.steps.map((step) => step.id)).toEqual([captureStep.id]);
  expect(getHarness().selectedStepId).toBe(captureStep.id);
  expect(getHarness().quickEditStepId).toBe(captureStep.id);
});

it('clears invalid quick-edit steps when an undo snapshot no longer points at a capture step', async () => {
  const { captureStep, noteStep, project } = createProjectFixture();
  await renderHarness(project);

  await act(async () => {
    getHarness().setSelectedStepId(noteStep.id);
    getHarness().setQuickEditStepId(noteStep.id);
    await flushEffects();
  });

  await act(async () => {
    getHarness().trackProjectMutation();
    getHarness().setProject((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        updatedAt: 30,
        steps: [noteStep],
      };
    });
    await flushEffects();
  });

  await act(async () => {
    getHarness().undoProjectChange();
    await flushEffects();
  });

  expect(getHarness().project?.steps.map((step) => step.id)).toEqual([captureStep.id, noteStep.id]);
  expect(getHarness().selectedStepId).toBe(noteStep.id);
  expect(getHarness().quickEditStepId).toBeNull();
});

it('tracks undo history even when a mutation keeps the same updatedAt timestamp', async () => {
  const { captureStep, noteStep, project } = createProjectFixture();
  await renderHarness(project);

  await act(async () => {
    getHarness().trackProjectMutation();
    getHarness().setProject((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        updatedAt: current.updatedAt,
        steps: [captureStep],
      };
    });
    await flushEffects();
  });

  expect(getHarness().canUndoProject).toBe(true);

  await act(async () => {
    getHarness().undoProjectChange();
    await flushEffects();
  });

  expect(getHarness().project?.steps.map((step) => step.id)).toEqual([captureStep.id, noteStep.id]);
  expect(getHarness().selectedStepId).toBe(captureStep.id);
  expect(getHarness().quickEditStepId).toBe(captureStep.id);
});

it('stores detached project snapshots across undo and redo history', async () => {
  const { captureStep, project } = createProjectFixture();
  await renderHarness(project);

  await act(async () => {
    getHarness().trackProjectMutation();
    getHarness().setProject((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        updatedAt: 40,
        steps: [captureStep],
      };
    });
    await flushEffects();
  });

  const currentProject = getHarness().project;
  if (!currentProject) {
    throw new Error('Project history harness did not keep the project snapshot');
  }

  currentProject.name = 'Mutated project name';

  await act(async () => {
    getHarness().undoProjectChange();
    await flushEffects();
  });

  expect(getHarness().project?.name).toBe('Scenario');

  await act(async () => {
    getHarness().redoProjectChange();
    await flushEffects();
  });
  expect(getHarness().project?.name).toBe('Scenario');
});
