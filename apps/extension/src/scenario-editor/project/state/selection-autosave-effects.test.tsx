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
  error: string | null;
  savedProjectRef: React.MutableRefObject<ScenarioProject | null>;
  saveState: 'error' | 'saved' | 'saving';
  setProject: React.Dispatch<React.SetStateAction<ScenarioProject | null>>;
  syncProjectSummaryMock: (project: ScenarioProject) => void;
} | null = null;

function AutosaveHarness(props: {
  initialProject: ScenarioProject | null;
  initialSavedProject: ScenarioProject | null;
  syncProjectSummaryMock: (project: ScenarioProject) => void;
}) {
  const [project, setProject] = useState<ScenarioProject | null>(props.initialProject);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'error' | 'saved' | 'saving'>('saved');
  const savedProjectRef = useRef<ScenarioProject | null>(props.initialSavedProject);

  useScenarioEditorAutosave({
    project,
    savedProjectRef,
    setError,
    setSaveState,
    syncProjectSummary: props.syncProjectSummaryMock,
  });

  useEffect(() => {
    latestHarness = {
      error,
      savedProjectRef,
      saveState,
      setProject,
      syncProjectSummaryMock: props.syncProjectSummaryMock,
    };
  }, [error, props.syncProjectSummaryMock, saveState, setProject]);

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
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, reject, resolve };
}

function getHarness() {
  if (!latestHarness) {
    throw new Error('Autosave harness is not ready');
  }

  return latestHarness;
}

function requireUpdatedProject(project: ScenarioProject | null): ScenarioProject {
  if (!project) {
    throw new Error('Expected project update');
  }
  return project;
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderHarness(args: {
  initialProject: ScenarioProject | null;
  initialSavedProject: ScenarioProject | null;
  syncProjectSummaryMock: (project: ScenarioProject) => void;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<AutosaveHarness {...args} />);
    await flushEffects();
  });
}

function renderProjectHarness(
  project: ScenarioProject,
  syncProjectSummaryMock: (project: ScenarioProject) => void
) {
  return renderHarness({
    initialProject: project,
    initialSavedProject: project,
    syncProjectSummaryMock,
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

  return requireUpdatedProject(nextProject);
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

it('saves a changed project even when updatedAt stays the same', async () => {
  const syncProjectSummaryMock = vi.fn();
  const { project } = createProjectFixture(10);
  await renderProjectHarness(project, syncProjectSummaryMock);

  await updateProjectName('Updated name');
  await triggerAutosaveTimer();

  expect(saveScenarioProjectRecordMock).toHaveBeenCalledTimes(1);
  expect(saveScenarioProjectRecordMock).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Updated name' }),
    { baseUpdatedAt: 10 }
  );
  expect(syncProjectSummaryMock).toHaveBeenCalledTimes(1);
  expect(getHarness().savedProjectRef.current?.name).toBe('Updated name');
  expect(getHarness().saveState).toBe('saved');
});

it('ignores stale save completions after a newer project revision is scheduled', async () => {
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

  await act(async () => {
    firstSave.resolve({ ...firstChangedProject, updatedAt: 11 });
    await flushEffects();
  });

  expect(syncProjectSummaryMock).not.toHaveBeenCalled();
  expect(getHarness().savedProjectRef.current).not.toBe(firstChangedProject);

  await act(async () => {
    secondSave.resolve({ ...secondChangedProject, updatedAt: 12 });
    await flushEffects();
  });

  expect(syncProjectSummaryMock).toHaveBeenCalledTimes(1);
  expect(syncProjectSummaryMock).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Second change', updatedAt: 12 })
  );
  expect(getHarness().savedProjectRef.current).toEqual(
    expect.objectContaining({ name: 'Second change', updatedAt: 12 })
  );
  expect(getHarness().error).toBeNull();
  expect(getHarness().saveState).toBe('saved');
});

it('surfaces the current save error when the latest autosave fails', async () => {
  const syncProjectSummaryMock = vi.fn();
  const { project } = createProjectFixture(10);
  saveScenarioProjectRecordMock.mockRejectedValue(new Error('Save failed'));

  await renderProjectHarness(project, syncProjectSummaryMock);

  await updateProjectName('Broken save');
  await triggerAutosaveTimer();

  expect(syncProjectSummaryMock).not.toHaveBeenCalled();
  expect(getHarness().savedProjectRef.current).toBe(project);
  expect(getHarness().error).toBe('Save failed');
  expect(getHarness().saveState).toBe('error');
});

it('ignores stale save failures after a newer project revision is scheduled', async () => {
  const syncProjectSummaryMock = vi.fn();
  const { project } = createProjectFixture(10);
  const firstSave = createDeferred<ScenarioProject>();
  const secondSave = createDeferred<ScenarioProject>();
  saveScenarioProjectRecordMock
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);

  await renderProjectHarness(project, syncProjectSummaryMock);

  await updateProjectName('First change');
  await triggerAutosaveTimer();
  const secondChangedProject = await updateProjectName('Second change');
  await triggerAutosaveTimer();

  await act(async () => {
    firstSave.reject(new Error('Old save failed'));
    await flushEffects();
  });

  expect(getHarness().error).toBeNull();
  expect(getHarness().savedProjectRef.current).toBe(project);

  await act(async () => {
    secondSave.resolve({ ...secondChangedProject, updatedAt: 12 });
    await flushEffects();
  });

  expect(syncProjectSummaryMock).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Second change', updatedAt: 12 })
  );
  expect(getHarness().saveState).toBe('saved');
});
