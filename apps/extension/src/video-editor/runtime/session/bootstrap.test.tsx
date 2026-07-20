// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { ApplyLoadedProject } from './types';

const { loadInitialProjectFromLocationMock } = vi.hoisted(() => ({
  loadInitialProjectFromLocationMock: vi.fn(),
}));

vi.mock('../../project/operations/ops', () => ({
  loadInitialProjectFromLocation: loadInitialProjectFromLocationMock,
}));

import { useVideoEditorBootstrap } from './bootstrap';

function createDeferred<T>() {
  let rejectPromise: (error: unknown) => void;
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise!,
    resolve: resolvePromise!,
  };
}

function BootstrapHarness(props: {
  applyLoadedProject: ApplyLoadedProject;
  refreshProjectExports: (projectId: string | null) => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshRecordings: () => Promise<void>;
  setError: (message: string | null) => void;
  setReady: (ready: boolean) => void;
}) {
  useVideoEditorBootstrap(
    props.applyLoadedProject,
    props.setError,
    props.setReady,
    props.refreshRecordings,
    props.refreshProjects,
    props.refreshProjectExports
  );

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loadInitialProjectFromLocationMock.mockReset();
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderBootstrapHarness(props: Parameters<typeof BootstrapHarness>[0]) {
  await act(async () => {
    root?.render(<BootstrapHarness {...props} />);
  });
}

async function verifyReadyWaitsForDependentRefreshes() {
  const project = createEmptyVideoProject('Bootstrap');
  const refreshRecordings = createDeferred<void>();
  const refreshProjects = createDeferred<void>();
  const refreshProjectExports = createDeferred<void>();
  const applyLoadedProject = vi.fn<ApplyLoadedProject>();
  const setError = vi.fn();
  const setReady = vi.fn();

  loadInitialProjectFromLocationMock.mockResolvedValue({
    project,
    recordingId: 'recording-1',
  });

  await renderBootstrapHarness({
    applyLoadedProject,
    refreshProjectExports: () => refreshProjectExports.promise,
    refreshProjects: () => refreshProjects.promise,
    refreshRecordings: () => refreshRecordings.promise,
    setError,
    setReady,
  });
  await flushEffects();

  expect(applyLoadedProject).toHaveBeenCalledWith(project, 'recording-1');
  expect(setReady).not.toHaveBeenCalled();

  refreshRecordings.resolve();
  refreshProjects.resolve();
  refreshProjectExports.resolve();
  await flushEffects();

  expect(setError).not.toHaveBeenCalled();
  expect(setReady).toHaveBeenCalledWith(true);
}

async function verifyRefreshFailuresSurfaceBeforeReady() {
  const project = createEmptyVideoProject('Bootstrap failure');
  const applyLoadedProject = vi.fn<ApplyLoadedProject>();
  const setError = vi.fn();
  const setReady = vi.fn();

  loadInitialProjectFromLocationMock.mockResolvedValue({
    project,
    recordingId: 'recording-2',
  });

  await renderBootstrapHarness({
    applyLoadedProject,
    refreshProjectExports: () => Promise.reject(new Error('exports failed')),
    refreshProjects: () => Promise.resolve(),
    refreshRecordings: () => Promise.resolve(),
    setError,
    setReady,
  });
  await flushEffects();

  expect(applyLoadedProject).toHaveBeenCalledWith(project, 'recording-2');
  expect(setError).toHaveBeenCalledWith('exports failed');
  expect(setReady).toHaveBeenCalledWith(true);
}

describe('useVideoEditorBootstrap', () => {
  it(
    'waits for dependent library refreshes before marking the editor ready',
    verifyReadyWaitsForDependentRefreshes
  );
  it(
    'surfaces refresh failures before switching the editor to ready',
    verifyRefreshFailuresSurfaceBeforeReady
  );
});
