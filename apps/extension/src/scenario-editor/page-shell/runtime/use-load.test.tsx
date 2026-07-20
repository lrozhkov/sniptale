// @vitest-environment jsdom

import { act, useRef, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

const { loadScenarioV3EditorProjectMock, replaceScenarioEditorSelectionInUrlMock } = vi.hoisted(
  () => ({
    loadScenarioV3EditorProjectMock: vi.fn(),
    replaceScenarioEditorSelectionInUrlMock: vi.fn(),
  })
);

vi.mock('../../platform/browser-driver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/browser-driver')>();
  return {
    ...actual,
    replaceScenarioEditorSelectionInUrl: replaceScenarioEditorSelectionInUrlMock,
  };
});
vi.mock('./load', () => ({
  loadScenarioV3EditorProject: loadScenarioV3EditorProjectMock,
}));

import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { useScenarioV3ProjectLoader } from './use-load';
import type { ScenarioV3PageSaveState } from './types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useScenarioV3ProjectLoader', () => {
  it('ignores stale load completions that resolve after a newer load', async () => {
    const first = createDeferred<ScenarioProjectV3>();
    const second = createDeferred<ScenarioProjectV3>();
    const setProject = vi.fn();
    loadScenarioV3EditorProjectMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderLoader({ setProject });

    await clickLoad();
    await clickLoad();
    await act(async () => {
      second.resolve(createScenarioProjectV3('Second'));
      await second.promise;
      first.resolve(createScenarioProjectV3('First'));
      await first.promise;
    });

    expect(setProject).toHaveBeenCalledTimes(1);
    expect(setProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Second' }));
    expect(replaceScenarioEditorSelectionInUrlMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the latest load failure and clears loading', async () => {
    const setError = vi.fn();
    const setLoading = vi.fn();
    loadScenarioV3EditorProjectMock.mockRejectedValue(new Error('No database'));
    renderLoader({ setError, setLoading });

    await clickLoad();

    expect(setError).toHaveBeenCalledWith('No database');
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it('tracks the loaded project as the saved baseline', async () => {
    const savedProjectRef: MutableRefObject<ScenarioProjectV3 | null> = { current: null };
    const loadedProject = withUpdatedAt(createScenarioProjectV3('Loaded'), 40);
    loadScenarioV3EditorProjectMock.mockResolvedValue(loadedProject);
    renderLoader({ savedProjectRef });

    await clickLoad();

    expect(savedProjectRef.current).toBe(loadedProject);
    expect(replaceScenarioEditorSelectionInUrlMock).toHaveBeenCalledWith({
      projectId: loadedProject.id,
    });
  });
});

function renderLoader(overrides: Partial<LoaderHarnessProps> = {}) {
  act(() => {
    root?.render(<LoaderHarness {...overrides} />);
  });
}

interface LoaderHarnessProps {
  savedProjectRef: MutableRefObject<ScenarioProjectV3 | null>;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setProject: (project: ScenarioProjectV3) => void;
  setSaveState: (saveState: ScenarioV3PageSaveState) => void;
}

function LoaderHarness(props: Partial<LoaderHarnessProps>) {
  const loadRevisionRef = useRef(0);
  const requestedProjectIdRef = useRef<string | null>(null);
  const localSavedProjectRef = useRef<ScenarioProjectV3 | null>(null);
  const savedProjectRef = props.savedProjectRef ?? localSavedProjectRef;
  const { loadProject } = useScenarioV3ProjectLoader({
    createProjectName: 'New scenario',
    loadRevisionRef,
    requestedProjectIdRef,
    savedProjectRef,
    setError: props.setError ?? vi.fn(),
    setLoading: props.setLoading ?? vi.fn(),
    setProject: props.setProject ?? vi.fn(),
    setSaveState: props.setSaveState ?? vi.fn(),
  });

  return (
    <button type="button" onClick={() => void loadProject()}>
      load
    </button>
  );
}

async function clickLoad() {
  const button = container?.querySelector<HTMLButtonElement>('button');
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function withUpdatedAt(project: ScenarioProjectV3, updatedAt: number): ScenarioProjectV3 {
  return { ...project, updatedAt };
}
