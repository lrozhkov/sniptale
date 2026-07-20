// @vitest-environment jsdom

import { act } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioProject,
} from '../../../features/scenario/project/public';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import { useScenarioEditorAutosave } from './selection-autosave-effects';

const { saveScenarioProjectRecordMock } = vi.hoisted(() => ({
  saveScenarioProjectRecordMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  saveScenarioProjectRecord: saveScenarioProjectRecordMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHarness: {
  savedProjectRef: React.MutableRefObject<ScenarioProject | null>;
  saveState: 'error' | 'saved' | 'saving';
  setProject: React.Dispatch<React.SetStateAction<ScenarioProject | null>>;
} | null = null;

function AutosaveHarness(props: {
  initialProject: ScenarioProject | null;
  initialSavedProject: ScenarioProject | null;
  syncProjectSummaryMock: (project: ScenarioProject) => void;
}) {
  const [project, setProject] = useState<ScenarioProject | null>(props.initialProject);
  const [saveState, setSaveState] = useState<'error' | 'saved' | 'saving'>('saved');
  const savedProjectRef = useRef<ScenarioProject | null>(props.initialSavedProject);

  useScenarioEditorAutosave({
    project,
    savedProjectRef,
    setError: vi.fn(),
    setSaveState,
    syncProjectSummary: props.syncProjectSummaryMock,
  });

  useEffect(() => {
    latestHarness = {
      savedProjectRef,
      saveState,
      setProject,
    };
  }, [saveState]);

  return null;
}

function createProjectFixture(updatedAt = 10) {
  const project = createScenarioProject('Scenario');
  return {
    project: {
      ...project,
      steps: [createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture' })],
      updatedAt,
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function getHarness() {
  if (!latestHarness) {
    throw new Error('Autosave harness is not ready');
  }
  return latestHarness;
}

function requireScenarioProject(project: ScenarioProject | null): ScenarioProject {
  if (!project) {
    throw new Error('Expected project update');
  }
  return project;
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderProjectHarness(
  project: ScenarioProject,
  syncProjectSummaryMock: (project: ScenarioProject) => void
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <AutosaveHarness
        initialProject={project}
        initialSavedProject={project}
        syncProjectSummaryMock={syncProjectSummaryMock}
      />
    );
    await flushEffects();
  });
}

async function updateProjectName(name: string) {
  let nextProject: ScenarioProject | null = null;

  await act(async () => {
    getHarness().setProject((current) => {
      if (!current) {
        return current;
      }

      nextProject = {
        ...current,
        name,
        updatedAt: current.updatedAt,
      };
      return nextProject;
    });
    await flushEffects();
  });

  return requireScenarioProject(nextProject);
}

async function triggerAutosaveTimer() {
  await act(async () => {
    vi.advanceTimersByTime(700);
    await flushEffects();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  saveScenarioProjectRecordMock.mockImplementation(async (project) => project);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestHarness = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('queues a newer autosave on the prior write revision instead of reusing a stale base', async () => {
  const syncProjectSummaryMock = vi.fn();
  const { project } = createProjectFixture(10);
  const firstSave = createDeferred<ScenarioProject>();
  const secondSave = createDeferred<ScenarioProject>();
  saveScenarioProjectRecordMock
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);

  await renderProjectHarness(project, syncProjectSummaryMock);

  const firstChangedProject = await updateProjectName('First change');
  await triggerAutosaveTimer();
  const secondChangedProject = await updateProjectName('Second change');
  await triggerAutosaveTimer();

  expect(saveScenarioProjectRecordMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    firstSave.resolve({ ...firstChangedProject, updatedAt: 11 });
    await flushEffects();
  });

  expect(saveScenarioProjectRecordMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ name: 'Second change' }),
    { baseUpdatedAt: 11 }
  );

  await act(async () => {
    secondSave.resolve({ ...secondChangedProject, updatedAt: 12 });
    await flushEffects();
  });

  expect(syncProjectSummaryMock).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Second change', updatedAt: 12 })
  );
});

it('does not let a stale save from another project replace the current saved revision', async () => {
  const { project: projectA } = createProjectFixture(10);
  const projectB = {
    ...createProjectFixture(20).project,
    id: 'project-b',
    name: 'Project B',
  };
  const firstSave = createDeferred<ScenarioProject>();
  const secondSave = createDeferred<ScenarioProject>();
  saveScenarioProjectRecordMock
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);

  await renderProjectHarness(projectA, vi.fn());

  const projectAChange = await updateProjectName('Project A edit');
  await triggerAutosaveTimer();

  await act(async () => {
    getHarness().setProject(projectB);
    getHarness().savedProjectRef.current = projectB;
    await flushEffects();
  });

  await act(async () => {
    firstSave.resolve({ ...projectAChange, updatedAt: 11 });
    await flushEffects();
  });

  const projectBChange = await updateProjectName('Project B edit');
  await triggerAutosaveTimer();

  expect(saveScenarioProjectRecordMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: 'project-b', name: 'Project B edit' }),
    { baseUpdatedAt: 20 }
  );

  await act(async () => {
    secondSave.resolve({ ...projectBChange, updatedAt: 21 });
    await flushEffects();
  });

  expect(getHarness().savedProjectRef.current).toEqual(
    expect.objectContaining({ id: 'project-b', name: 'Project B edit', updatedAt: 21 })
  );
});
