// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioProject,
} from '../../../features/scenario/project/public';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import { useScenarioEditorSelectionEffects } from './selection-autosave-effects';

const { replaceSelectionInUrlMock } = vi.hoisted(() => ({
  replaceSelectionInUrlMock: vi.fn(),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function SelectionHarness(props: {
  project: ScenarioProject | null;
  projectId: string | null;
  selectedStepId: string | null;
  setSelectedStepId: (stepId: string | null) => void;
}) {
  useScenarioEditorSelectionEffects({
    ...props,
    browserDriver: { replaceSelectionInUrl: replaceSelectionInUrlMock },
  });
  return null;
}

function createProjectFixture() {
  const project = createScenarioProject('Scenario');
  return {
    ...project,
    steps: [createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture' })],
  };
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderSelectionHarness(props: Parameters<typeof SelectionHarness>[0]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<SelectionHarness {...props} />);
    await flushEffects();
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

it('clears selection for missing projects and mirrors URL selection state', async () => {
  const setSelectedStepId = vi.fn();

  await renderSelectionHarness({
    project: null,
    projectId: null,
    selectedStepId: 'step-1',
    setSelectedStepId,
  });

  expect(setSelectedStepId).toHaveBeenCalledWith(null);
  expect(replaceSelectionInUrlMock).toHaveBeenCalledWith({ projectId: null, stepId: 'step-1' });
});

it('moves stale selection to the first available scenario step', async () => {
  const setSelectedStepId = vi.fn();
  const project = createProjectFixture();

  await renderSelectionHarness({
    project,
    projectId: project.id,
    selectedStepId: 'missing-step',
    setSelectedStepId,
  });

  expect(setSelectedStepId).toHaveBeenCalledWith(project.steps[0]?.id);
  expect(replaceSelectionInUrlMock).toHaveBeenCalledWith({
    projectId: project.id,
    stepId: 'missing-step',
  });
});
