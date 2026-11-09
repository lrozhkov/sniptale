// @vitest-environment jsdom
const wakeCheckpoints = vi.hoisted(() => vi.fn());
vi.mock('../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({ wakeCheckpoints }),
}));
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject as createDomainProject } from '../../../features/video/project/factories/creation';
import { requestVideoEditorSaveRetry } from './save-retry';
import { useVideoEditorStore } from '../../state/store';
import {
  observeVideoEditorSave,
  waitForVideoEditorSave,
  prepareVideoEditorCheckpointExit,
} from './save-readiness';

const checkpointReceiptForSave = vi.fn();
const acquireCheckpoint = vi.fn();
const releaseCheckpoint = vi.fn();
vi.mock('../../../composition/persistence/sync-capture/checkpoint-publication', () => ({
  acquireSyncCheckpointEdit: acquireCheckpoint,
}));
const saveVideoProject = vi.fn();
const getVideoProject = vi.fn();
const replaceVideoEditorUrl = vi.fn();
const initialProjects = new Map<string, ReturnType<typeof createDomainProject>>();
function createEmptyVideoProject(...args: Parameters<typeof createDomainProject>) {
  const project = createDomainProject(...args);
  initialProjects.set(project.id, structuredClone(project));
  return project;
}

vi.mock('../../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: saveVideoProject,
  commitVideoProjectWorkspaceMutation: async (
    project: ReturnType<typeof createEmptyVideoProject>,
    options: {
      expectedWorkspaceRevision: number | null;
      expectedProject: ReturnType<typeof createDomainProject> | null;
    }
  ) => {
    const saved = await saveVideoProject(project, options);
    const checkpointReceipt = checkpointReceiptForSave(project);
    return {
      project: saved,
      workspaceRevision: (options.expectedWorkspaceRevision ?? 0) + 1,
      ...(checkpointReceipt ? { checkpointReceipt } : {}),
    };
  },
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  getVideoProject,
}));

vi.mock('../browser-driver', () => ({
  replaceVideoEditorUrl,
}));

async function importAutoSaveHook() {
  return (await import('./auto-save')).useVideoEditorAutoSave;
}

type AutoSaveHarnessProps = {
  enabled?: boolean;
  project: ReturnType<typeof createEmptyVideoProject>;
  projectId: string | null;
  refreshProjects: () => Promise<void>;
  root: Root | null;
  setSaveState: (state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void;
  syncProjectRevision?: (
    expectedProject: ReturnType<typeof createEmptyVideoProject>,
    persistedUpdatedAt: number
  ) => void;
  useVideoEditorAutoSave: (typeof import('./auto-save'))['useVideoEditorAutoSave'];
};

function AutoSaveHarness(props: AutoSaveHarnessProps) {
  props.useVideoEditorAutoSave(
    props.project,
    props.projectId,
    props.setSaveState,
    props.refreshProjects,
    props.syncProjectRevision,
    props.enabled
  );
  return null;
}

function renderAutoSaveHarness(props: AutoSaveHarnessProps) {
  act(() => {
    useVideoEditorStore.setState({ project: props.project });
    props.root?.render(<AutoSaveHarness {...props} />);
  });
}

async function flushAutoSaveTimers() {
  await act(async () => {
    vi.advanceTimersByTime(EDITOR_AUTOSAVE_POLICY.delay);
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  wakeCheckpoints.mockReset().mockResolvedValue({ kind: 'checkpoint-woken' });
  vi.useFakeTimers();
  checkpointReceiptForSave.mockReset();
  acquireCheckpoint.mockReset().mockImplementation(async () => ({ release: releaseCheckpoint }));
  releaseCheckpoint.mockReset().mockResolvedValue(undefined);
  saveVideoProject.mockReset();
  getVideoProject.mockReset();
  initialProjects.clear();
  getVideoProject.mockImplementation(async (id: string) => {
    const project = initialProjects.get(id);
    return project
      ? { status: 'ready', project: structuredClone(project), workspaceRevision: 0 }
      : { status: 'notFound' };
  });
  replaceVideoEditorUrl.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
});

function StoreAutoSaveHarness(props: {
  refreshProjects: () => Promise<void>;
  useVideoEditorAutoSave: (typeof import('./auto-save'))['useVideoEditorAutoSave'];
}) {
  const project = useVideoEditorStore((state) => state.project);
  const recordingId = useVideoEditorStore((state) => state.recordingId);
  const setSaveState = useVideoEditorStore((state) => state.setSaveState);
  const syncProjectRevision = useVideoEditorStore((state) => state.syncProjectRevision);
  props.useVideoEditorAutoSave(
    project,
    recordingId,
    setSaveState,
    props.refreshProjects,
    syncProjectRevision
  );
  return null;
}

it('saves the project after the debounce and refreshes project metadata', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Autosave');
  const setSaveState =
    vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void>();
  const refreshProjects = vi.fn().mockResolvedValue(undefined);

  saveVideoProject.mockResolvedValue({ ...project, updatedAt: 200 });
  renderAutoSaveHarness({
    project,
    projectId: 'rec-1',
    refreshProjects,
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });

  const editedProject = { ...project, name: 'Autosave edited' };
  renderAutoSaveHarness({
    project: editedProject,
    projectId: 'rec-1',
    refreshProjects,
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });

  expect(setSaveState).toHaveBeenLastCalledWith('dirty');
  await flushAutoSaveTimers();

  expect(saveVideoProject).toHaveBeenCalledWith(
    editedProject,
    expect.objectContaining({ expectedWorkspaceRevision: 0 })
  );
  expect(setSaveState).toHaveBeenCalledWith('saving');
  expect(setSaveState).toHaveBeenCalledWith('saved');
  expect(replaceVideoEditorUrl).toHaveBeenCalledWith(project.id, 'rec-1');
  expect(refreshProjects).toHaveBeenCalledTimes(1);
});

it('treats a freshly loaded persisted project as saved until it is actually edited', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Already persisted');
  const setSaveState =
    vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void>();

  renderAutoSaveHarness({
    project,
    projectId: null,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });
  await flushAutoSaveTimers();

  expect(setSaveState).toHaveBeenCalledWith('saved');
  expect(setSaveState).not.toHaveBeenCalledWith('saving');
  expect(saveVideoProject).not.toHaveBeenCalled();
});

it('syncs the saved revision into editor state without triggering a duplicate autosave', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  let currentProject = createEmptyVideoProject('Autosave revision sync');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState =
    vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void>();
  const syncProjectRevision = vi.fn(
    (expectedProject: typeof currentProject, persistedUpdatedAt: number) => {
      if (currentProject === expectedProject) {
        currentProject = { ...currentProject, updatedAt: persistedUpdatedAt };
      }
    }
  );
  const Harness = () => {
    useVideoEditorAutoSave(
      currentProject,
      'rec-1',
      setSaveState,
      refreshProjects,
      syncProjectRevision
    );
    return null;
  };

  saveVideoProject.mockResolvedValueOnce({ ...currentProject, updatedAt: 200 });
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();
  currentProject = { ...currentProject, name: 'Autosave revision sync edited' };
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();

  expect(syncProjectRevision).toHaveBeenCalledOnce();
  expect(currentProject.updatedAt).toBe(200);
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
});

it('persists an undone project without recording autosave revision sync as another edit', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('History autosave');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  saveVideoProject.mockImplementation(async (candidate) => ({
    ...candidate,
    updatedAt: candidate.updatedAt + 1,
  }));
  useVideoEditorStore.getState().setProject(project, 'rec-1');
  act(() => {
    root?.render(
      <StoreAutoSaveHarness
        refreshProjects={refreshProjects}
        useVideoEditorAutoSave={useVideoEditorAutoSave}
      />
    );
  });

  act(() => useVideoEditorStore.getState().renameProject('History autosave edited'));
  act(() => useVideoEditorStore.getState().undoProject());
  await flushAutoSaveTimers();
  await act(async () => undefined);

  expect(saveVideoProject).toHaveBeenCalledOnce();
  expect(saveVideoProject).toHaveBeenCalledWith(
    expect.objectContaining({ id: project.id, name: 'History autosave' }),
    expect.objectContaining({ expectedWorkspaceRevision: 0 })
  );
  expect(useVideoEditorStore.getState().projectHistory.future).toHaveLength(1);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
});

it('rejects a stale real-store autosave revision after project replacement', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const projectA = createEmptyVideoProject('Project A');
  const projectB = createEmptyVideoProject('Project B');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  let resolveSave: ((project: typeof projectA) => void) | null = null;
  saveVideoProject.mockImplementationOnce(
    () =>
      new Promise<typeof projectA>((resolve) => {
        resolveSave = resolve;
      })
  );
  useVideoEditorStore.getState().setProject(projectA, 'rec-a');
  act(() => {
    root?.render(
      <StoreAutoSaveHarness
        refreshProjects={refreshProjects}
        useVideoEditorAutoSave={useVideoEditorAutoSave}
      />
    );
  });
  act(() => useVideoEditorStore.getState().renameProject('Project A edited'));
  await flushAutoSaveTimers();

  act(() => useVideoEditorStore.getState().setProject(projectB, 'rec-b'));
  const activeProjectB = useVideoEditorStore.getState().project;
  const projectBHistory = useVideoEditorStore.getState().projectHistory;
  await act(async () => {
    resolveSave?.({ ...projectA, name: 'Project A edited', updatedAt: 500 });
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(useVideoEditorStore.getState().project).toBe(activeProjectB);
  expect(useVideoEditorStore.getState().project).toMatchObject({
    id: projectB.id,
    name: 'Project B',
    updatedAt: projectB.updatedAt,
  });
  expect(useVideoEditorStore.getState().projectHistory).toBe(projectBHistory);
});

it('queues overlapping same-project autosaves behind the persisted revision update', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Autosave overlap');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState =
    vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void>();
  let currentProject = project;
  let resolveFirstSave: ((project: typeof currentProject) => void) | null = null;
  const Harness = () => {
    useVideoEditorAutoSave(currentProject, 'rec-1', setSaveState, refreshProjects);
    return null;
  };

  saveVideoProject
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSave = resolve;
        })
    )
    .mockResolvedValueOnce({ ...project, updatedAt: 300 });
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();
  currentProject = { ...project, name: 'Autosave overlap first edit' };
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();
  currentProject = { ...project, name: 'Autosave overlap edited' };
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();

  expect(saveVideoProject).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveFirstSave?.({ ...project, updatedAt: 200 });
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(saveVideoProject).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ name: 'Autosave overlap edited' }),
    expect.objectContaining({ expectedWorkspaceRevision: 1 })
  );
});

it('coalesces obsolete snapshots while an admitted save is still pending', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Coalesced');
  const props: AutoSaveHarnessProps = {
    project,
    projectId: 'rec-1',
    root,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    setSaveState: vi.fn(),
    useVideoEditorAutoSave,
  };
  let finishFirst: (saved: typeof project) => void = () => undefined;
  saveVideoProject
    .mockImplementationOnce(
      () =>
        new Promise<typeof project>((resolve) => {
          finishFirst = resolve;
        })
    )
    .mockImplementation(async (candidate: typeof project) => ({ ...candidate, updatedAt: 300 }));
  renderAutoSaveHarness(props);
  const first = { ...project, name: 'First' };
  renderAutoSaveHarness({ ...props, project: first });
  await flushAutoSaveTimers();
  renderAutoSaveHarness({ ...props, project: { ...project, name: 'Obsolete' } });
  await flushAutoSaveTimers();
  const latest = { ...project, name: 'Latest' };
  renderAutoSaveHarness({ ...props, project: latest });
  await flushAutoSaveTimers();
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
  await act(async () => {
    finishFirst({ ...first, updatedAt: 200 });
  });
  expect(saveVideoProject).toHaveBeenCalledTimes(2);
  expect(saveVideoProject).toHaveBeenLastCalledWith(
    latest,
    expect.objectContaining({ expectedWorkspaceRevision: 1 })
  );
});

it('flushes the newest edit immediately while a project transition waits for the latest version', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Deadline');
  const props: AutoSaveHarnessProps = {
    project,
    projectId: 'rec-1',
    root,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    setSaveState: vi.fn(),
    useVideoEditorAutoSave,
  };
  let finish: (saved: typeof project) => void = () => undefined;
  saveVideoProject
    .mockImplementationOnce(
      () =>
        new Promise<typeof project>((resolve) => {
          finish = resolve;
        })
    )
    .mockImplementation(async (candidate: typeof project) => ({ ...candidate, updatedAt: 300 }));
  renderAutoSaveHarness(props);
  const first = { ...project, name: 'First' };
  renderAutoSaveHarness({ ...props, project: first });
  await flushAutoSaveTimers();
  const barrier = waitForVideoEditorSave(project.id);
  let settled = false;
  void barrier.then(() => {
    settled = true;
  });
  const latest = { ...project, name: 'Typing' };
  renderAutoSaveHarness({ ...props, project: latest });
  await act(async () => {
    vi.advanceTimersByTime(100);
    finish({ ...first, updatedAt: 200 });
  });
  await act(async () => barrier);
  expect(settled).toBe(true);
  expect(saveVideoProject).toHaveBeenCalledTimes(2);
  expect(saveVideoProject).toHaveBeenLastCalledWith(
    latest,
    expect.objectContaining({ expectedWorkspaceRevision: 1 })
  );
  await expect(barrier).resolves.toBeUndefined();
});

it('captures a current store edit before React observes it, including an explicit paused barrier', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Latest barrier');
  const props: AutoSaveHarnessProps = {
    project,
    projectId: null,
    root,
    enabled: false,
    refreshProjects: vi.fn(async () => undefined),
    setSaveState: vi.fn(),
    useVideoEditorAutoSave,
  };
  renderAutoSaveHarness(props);
  const newest = { ...project, name: 'Changed synchronously' };
  useVideoEditorStore.setState({ project: newest });
  saveVideoProject.mockResolvedValue(newest);
  await act(async () => waitForVideoEditorSave(project.id));
  expect(saveVideoProject).toHaveBeenCalledOnce();
  expect(saveVideoProject).toHaveBeenCalledWith(
    newest,
    expect.objectContaining({ expectedWorkspaceRevision: 0 })
  );
});

it('does not reuse an old acknowledgement after project A is replaced by B and reopened', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('A');
  const props: AutoSaveHarnessProps = {
    project,
    projectId: 'rec-1',
    root,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    setSaveState: vi.fn(),
    syncProjectRevision: vi.fn(),
    useVideoEditorAutoSave,
  };
  let finish: (saved: typeof project) => void = () => undefined;
  saveVideoProject
    .mockImplementationOnce(
      () =>
        new Promise<typeof project>((resolve) => {
          finish = resolve;
        })
    )
    .mockImplementation(async (candidate: typeof project) => candidate);
  renderAutoSaveHarness(props);
  renderAutoSaveHarness({ ...props, project: { ...project, name: 'Old edit' } });
  await flushAutoSaveTimers();
  renderAutoSaveHarness({ ...props, project: createEmptyVideoProject('B') });
  renderAutoSaveHarness({ ...props, project });
  const latest = { ...project, name: 'Reopened edit' };
  renderAutoSaveHarness({ ...props, project: latest });
  await flushAutoSaveTimers();
  await act(async () => {
    finish({ ...project, updatedAt: 500 });
  });
  expect(saveVideoProject).toHaveBeenLastCalledWith(
    latest,
    expect.objectContaining({ expectedWorkspaceRevision: 0 })
  );
  expect(props.syncProjectRevision).not.toHaveBeenCalled();
  expect(props.refreshProjects).toHaveBeenCalledTimes(1);
});

it('persists an edit made before the saved revision sync is consumed', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Revision edit');
  const props: AutoSaveHarnessProps = {
    project,
    projectId: 'rec-1',
    root,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    setSaveState: vi.fn(),
    syncProjectRevision: vi.fn(),
    useVideoEditorAutoSave,
  };
  saveVideoProject.mockImplementation(async (candidate: typeof project) => ({
    ...candidate,
    updatedAt: 200,
  }));
  renderAutoSaveHarness(props);
  renderAutoSaveHarness({ ...props, project: { ...project, name: 'First' } });
  await flushAutoSaveTimers();
  const latest = { ...project, name: 'New edit', updatedAt: 200 };
  renderAutoSaveHarness({ ...props, project: latest });
  await flushAutoSaveTimers();
  expect(saveVideoProject).toHaveBeenCalledTimes(2);
  expect(saveVideoProject).toHaveBeenLastCalledWith(
    latest,
    expect.objectContaining({ expectedWorkspaceRevision: 1 })
  );
});

it('rejects a pending barrier on unmount and lets the acquired write finish without UI publication', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Unmount');
  const props: AutoSaveHarnessProps = {
    project,
    projectId: 'rec-1',
    root,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    setSaveState: vi.fn(),
    useVideoEditorAutoSave,
  };
  let finish: (saved: typeof project) => void = () => undefined;
  saveVideoProject.mockImplementation(
    () =>
      new Promise<typeof project>((resolve) => {
        finish = resolve;
      })
  );
  renderAutoSaveHarness(props);
  const edited = { ...project, name: 'Edited' };
  renderAutoSaveHarness({ ...props, project: edited });
  await flushAutoSaveTimers();
  const barrier = waitForVideoEditorSave(project.id);
  act(() => {
    root?.unmount();
    root = null;
  });
  await expect(barrier).rejects.toThrow('could not be saved');
  const callsBeforeCompletion = vi.mocked(props.setSaveState).mock.calls.length;
  await act(async () => {
    finish({ ...edited, updatedAt: 200 });
  });
  expect(props.setSaveState).toHaveBeenCalledTimes(callsBeforeCompletion);
  expect(props.refreshProjects).not.toHaveBeenCalled();
  expect(replaceVideoEditorUrl).not.toHaveBeenCalled();
});

it('marks the save state as error when persistence fails', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Broken autosave');
  const setSaveState =
    vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void>();

  saveVideoProject.mockRejectedValue(new Error('persist failed'));
  renderAutoSaveHarness({
    project,
    projectId: null,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });

  renderAutoSaveHarness({
    project: { ...project, name: 'Broken autosave edited' },
    projectId: null,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });

  await flushAutoSaveTimers();

  expect(setSaveState).toHaveBeenCalledWith('error');
});

it('retries the current authoritative snapshot after a transient save failure', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Retry autosave');
  const editedProject = { ...project, name: 'Retry autosave edited' };
  const setSaveState =
    vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void>();

  saveVideoProject
    .mockRejectedValueOnce(new Error('transient failure'))
    .mockResolvedValueOnce({ ...editedProject, updatedAt: 300 });
  renderAutoSaveHarness({
    project,
    projectId: null,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });
  renderAutoSaveHarness({
    project: editedProject,
    projectId: null,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });
  await flushAutoSaveTimers();
  expect(setSaveState).toHaveBeenLastCalledWith('error');

  const retrySave = observeVideoEditorSave(project.id);
  let acknowledged = false;
  void retrySave.promise.then(
    () => {
      acknowledged = true;
    },
    () => undefined
  );
  act(() => requestVideoEditorSaveRetry());
  expect(setSaveState).toHaveBeenLastCalledWith('dirty');
  await flushAutoSaveTimers();

  expect(saveVideoProject).toHaveBeenCalledTimes(2);
  expect(saveVideoProject).toHaveBeenLastCalledWith(
    editedProject,
    expect.objectContaining({ expectedWorkspaceRevision: 0 })
  );
  expect(setSaveState).toHaveBeenLastCalledWith('saved');
  expect(acknowledged).toBe(true);
});

it('ignores stale save completions after the editor switches to a newer project', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const projectA = createEmptyVideoProject('Project A');
  const projectB = createEmptyVideoProject('Project B');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState =
    vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void>();
  let resolveFirstSave: ((savedProject: typeof projectA) => void) | null = null;

  saveVideoProject.mockImplementationOnce(
    () =>
      new Promise<typeof projectA>((resolve) => {
        resolveFirstSave = resolve;
      })
  );
  saveVideoProject.mockResolvedValueOnce({ ...projectB, updatedAt: 200 });

  renderAutoSaveHarness({
    project: projectA,
    projectId: 'rec-a',
    refreshProjects,
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });
  renderAutoSaveHarness({
    project: { ...projectA, name: 'Project A edited' },
    projectId: 'rec-a',
    refreshProjects,
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });
  await flushAutoSaveTimers();
  renderAutoSaveHarness({
    project: projectB,
    projectId: 'rec-b',
    refreshProjects,
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });
  await act(async () => {
    resolveFirstSave?.({ ...projectA, updatedAt: 200 });
    await Promise.resolve();
  });

  expect(replaceVideoEditorUrl).not.toHaveBeenCalled();
  expect(refreshProjects).not.toHaveBeenCalled();
});

it('cancels a queued save while paused and saves only the latest edits on resume', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const initial = createEmptyVideoProject('Initial');
  const props: AutoSaveHarnessProps = {
    project: initial,
    projectId: null,
    root,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    setSaveState: vi.fn(),
    useVideoEditorAutoSave,
  };
  saveVideoProject.mockImplementation(async (project) => project);
  renderAutoSaveHarness(props);
  renderAutoSaveHarness({ ...props, project: { ...initial, name: 'Queued' } });
  const latest = { ...initial, name: 'Latest', updatedAt: initial.updatedAt + 10 };
  renderAutoSaveHarness({ ...props, project: latest, enabled: false });
  await flushAutoSaveTimers();
  expect(saveVideoProject).not.toHaveBeenCalled();
  renderAutoSaveHarness({ ...props, project: latest, enabled: true });
  await flushAutoSaveTimers();
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
  expect(saveVideoProject).toHaveBeenCalledWith(latest, expect.anything());
});

it('ignores a late conflict from a project that has been replaced', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  let rejectSave: (error: Error) => void = () => undefined;
  saveVideoProject.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      })
  );
  const first = createEmptyVideoProject('First');
  const setSaveState = vi.fn();
  const props: AutoSaveHarnessProps = {
    project: first,
    projectId: null,
    root,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    setSaveState,
    useVideoEditorAutoSave,
  };
  renderAutoSaveHarness(props);
  renderAutoSaveHarness({ ...props, project: { ...first, name: 'Edited' } });
  await flushAutoSaveTimers();
  renderAutoSaveHarness({ ...props, project: createEmptyVideoProject('Second') });
  await act(async () =>
    rejectSave(Object.assign(new Error('stale'), { name: 'StaleVideoProjectSaveError' }))
  );
  expect(setSaveState).toHaveBeenLastCalledWith('saved');
});

function checkpointDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function mountCheckpointProject() {
  const project = createEmptyVideoProject('Checkpoint action');
  const hook = await importAutoSaveHook();
  useVideoEditorStore.getState().setProject(project, 'rec-1');
  act(() =>
    root?.render(
      <StoreAutoSaveHarness
        refreshProjects={vi.fn().mockResolvedValue(undefined)}
        useVideoEditorAutoSave={hook}
      />
    )
  );
  return project;
}
function beginCheckpointGesture() {
  let lease: symbol | null = null;
  act(() => {
    lease = useVideoEditorStore.getState().beginProjectHistoryTransaction();
  });
  if (!lease) throw new Error('Expected authored history transaction');
  return lease;
}

it('holds the checkpoint edit lease through a long history gesture and its final native ACK', async () => {
  await mountCheckpointProject();
  const final = checkpointDeferred<ReturnType<typeof createEmptyVideoProject>>();
  saveVideoProject
    .mockImplementationOnce(async (project) => project)
    .mockImplementationOnce(() => final.promise);
  const lease = beginCheckpointGesture();
  expect(acquireCheckpoint).toHaveBeenCalledOnce();
  act(() => useVideoEditorStore.getState().renameProject('Gesture intermediate'));
  await flushAutoSaveTimers();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  expect(saveVideoProject).toHaveBeenCalledOnce();
  await act(async () => {
    vi.advanceTimersByTime(6000);
  });
  expect(releaseCheckpoint).not.toHaveBeenCalled();
  act(() => useVideoEditorStore.getState().renameProject('Gesture completed'));
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  await act(async () => undefined);
  expect(saveVideoProject).toHaveBeenCalledTimes(2);
  expect(releaseCheckpoint).not.toHaveBeenCalled();
  const latest = useVideoEditorStore.getState().project;
  if (!latest) throw new Error('Expected latest project');
  await act(async () => {
    final.resolve(latest);
  });
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
  expect(saveVideoProject).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: 'Gesture completed' }),
    expect.anything()
  );
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
});

it('waits for initial checkpoint grant before native persistence', async () => {
  await mountCheckpointProject();
  const grant = checkpointDeferred<{ release: typeof releaseCheckpoint }>();
  acquireCheckpoint.mockImplementationOnce(() => grant.promise);
  saveVideoProject.mockImplementation(async (project) => project);
  const lease = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().renameProject('Responsive before lock'));
  await flushAutoSaveTimers();
  expect(useVideoEditorStore.getState().project?.name).toBe('Responsive before lock');
  expect(saveVideoProject).not.toHaveBeenCalled();
  await act(async () => {
    grant.resolve({ release: releaseCheckpoint });
  });
  expect(saveVideoProject).toHaveBeenCalledOnce();
  expect(releaseCheckpoint).not.toHaveBeenCalled();
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  await act(async () => undefined);
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
});

it('keeps a new gesture protected after the previous save ACK', async () => {
  await mountCheckpointProject();
  const old = checkpointDeferred<ReturnType<typeof createEmptyVideoProject>>();
  const latest = checkpointDeferred<ReturnType<typeof createEmptyVideoProject>>();
  saveVideoProject
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => latest.promise);
  const first = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().renameProject('First action'));
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(first));
  await act(async () => undefined);
  const savedFirst = useVideoEditorStore.getState().project!;
  const second = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().renameProject('Second action'));
  await act(async () => {
    old.resolve(savedFirst);
  });
  expect(releaseCheckpoint).not.toHaveBeenCalled();
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(second));
  await act(async () => undefined);
  await act(async () => {
    latest.resolve(useVideoEditorStore.getState().project!);
  });
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
});

it.each(['replace', 'dispose'] as const)(
  'releases retired protection after context replacement and disposal: %s',
  async (mode) => {
    await mountCheckpointProject();
    const saved = checkpointDeferred<ReturnType<typeof createEmptyVideoProject>>();
    saveVideoProject.mockImplementationOnce(() => saved.promise);
    beginCheckpointGesture();
    act(() => useVideoEditorStore.getState().renameProject('Pending old context'));
    await flushAutoSaveTimers();
    const old = useVideoEditorStore.getState().project!;
    if (mode === 'replace')
      act(() =>
        useVideoEditorStore.getState().setProject(createEmptyVideoProject('Replacement'), null)
      );
    else {
      act(() => root?.unmount());
      root = null;
    }
    expect(releaseCheckpoint).not.toHaveBeenCalled();
    await act(async () => {
      saved.resolve(old);
    });
    expect(releaseCheckpoint).toHaveBeenCalledOnce();
    if (mode === 'replace')
      expect(useVideoEditorStore.getState().project?.name).toBe('Replacement');
  }
);

it('retries a failed checkpoint acquisition through existing save retry', async () => {
  await mountCheckpointProject();
  acquireCheckpoint.mockRejectedValueOnce(new Error('Lock unavailable'));
  saveVideoProject.mockImplementation(async (project) => project);
  act(() => useVideoEditorStore.getState().renameProject('Retry protected save'));
  await flushAutoSaveTimers();
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(useVideoEditorStore.getState().saveState).toBe('error');
  act(() => requestVideoEditorSaveRetry());
  await flushAutoSaveTimers();
  expect(acquireCheckpoint).toHaveBeenCalledTimes(2);
  expect(saveVideoProject).toHaveBeenCalledOnce();
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
});

it.each(['replace', 'dispose'] as const)(
  'releases an ungranted retired lease without entering native persistence: %s',
  async (mode) => {
    await mountCheckpointProject();
    const grant = checkpointDeferred<{ release: typeof releaseCheckpoint }>();
    acquireCheckpoint.mockImplementationOnce(() => grant.promise);
    beginCheckpointGesture();
    act(() => useVideoEditorStore.getState().renameProject('Waiting on browser lock'));
    await flushAutoSaveTimers();
    if (mode === 'replace')
      act(() =>
        useVideoEditorStore.getState().setProject(createEmptyVideoProject('Replacement'), null)
      );
    else {
      act(() => root?.unmount());
      root = null;
    }
    expect(releaseCheckpoint).not.toHaveBeenCalled();
    await act(async () => {
      grant.resolve({ release: releaseCheckpoint });
    });
    expect(saveVideoProject).not.toHaveBeenCalled();
    expect(releaseCheckpoint).toHaveBeenCalledOnce();
  }
);

it('keeps a successor gesture lease when an older release settles', async () => {
  await mountCheckpointProject();
  const released = checkpointDeferred<void>();
  releaseCheckpoint.mockImplementationOnce(() => released.promise).mockResolvedValue(undefined);
  const first = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(first));
  await act(async () => undefined);
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
  const saved = checkpointDeferred<ReturnType<typeof createEmptyVideoProject>>();
  saveVideoProject.mockImplementationOnce(() => saved.promise);
  const second = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().renameProject('Protected successor'));
  await flushAutoSaveTimers();
  await act(async () => {
    released.resolve();
  });
  expect(acquireCheckpoint).toHaveBeenCalledTimes(2);
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(second));
  await act(async () => {
    saved.resolve(useVideoEditorStore.getState().project!);
  });
  expect(releaseCheckpoint).toHaveBeenCalledTimes(2);
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
});

it('reports a gesture lock refusal before retrying the pending local save', async () => {
  await mountCheckpointProject();
  acquireCheckpoint.mockRejectedValueOnce(new Error('Lock refused'));
  saveVideoProject.mockImplementation(async (project) => project);
  const lease = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().renameProject('Retained after refusal'));
  await act(async () => undefined);
  expect(useVideoEditorStore.getState().saveState).toBe('error');
  expect(saveVideoProject).not.toHaveBeenCalled();
  await flushAutoSaveTimers();
  expect(acquireCheckpoint).toHaveBeenCalledTimes(2);
  expect(saveVideoProject).toHaveBeenCalledOnce();
  expect(releaseCheckpoint).not.toHaveBeenCalled();
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  await act(async () => undefined);
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
});

it('retains completed-action protection after native refusal until retry ACK', async () => {
  await mountCheckpointProject();
  saveVideoProject
    .mockRejectedValueOnce(new Error('Native save refused'))
    .mockImplementation(async (project) => project);
  const lease = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().renameProject('Retained completed action'));
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  await act(async () => undefined);
  expect(useVideoEditorStore.getState().saveState).toBe('error');
  expect(releaseCheckpoint).not.toHaveBeenCalled();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  act(() => requestVideoEditorSaveRetry());
  await flushAutoSaveTimers();
  expect(saveVideoProject).toHaveBeenCalledTimes(2);
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
  expect(useVideoEditorStore.getState().project?.name).toBe('Retained completed action');
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
});

it('wakes Montage only after its accepted protection release settles', async () => {
  await mountCheckpointProject();
  const released = checkpointDeferred<void>();
  releaseCheckpoint.mockImplementationOnce(() => released.promise);
  saveVideoProject.mockImplementation(async (project) => project);
  const lease = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().renameProject('Accepted'));
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  await act(async () => undefined);
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  await act(async () => released.resolve());
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
});

it('does not wake Montage after a no-op history transaction', async () => {
  await mountCheckpointProject();
  const lease = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  await act(async () => undefined);
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
});

it('keeps Montage saved after advisory wake rejection', async () => {
  await mountCheckpointProject();
  wakeCheckpoints.mockRejectedValueOnce(new Error('Worker unavailable'));
  saveVideoProject.mockImplementation(async (project) => project);
  const lease = beginCheckpointGesture();
  act(() => useVideoEditorStore.getState().renameProject('Accepted'));
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  await act(async () => undefined);
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
  expect(useVideoEditorStore.getState().saveState).toBe('saved');
  expect(releaseCheckpoint).toHaveBeenCalledOnce();
});

it('retains native ACK receipts only in the matching Montage context', async () => {
  const project = await mountCheckpointProject();
  const receipt = {
    rootKind: 'video-project' as const,
    rootId: project.id,
    revision: '11111111-1111-4111-8111-111111111111',
  };
  const ack = checkpointDeferred<ReturnType<typeof createEmptyVideoProject>>();
  checkpointReceiptForSave.mockReturnValueOnce(receipt);
  saveVideoProject.mockImplementationOnce(() => ack.promise);
  act(() => useVideoEditorStore.getState().renameProject('Receipted native save'));
  await flushAutoSaveTimers();
  let prepared = false;
  const waiting = prepareVideoEditorCheckpointExit(project.id);
  void waiting.then(() => {
    prepared = true;
  });
  await act(async () => undefined);
  expect(prepared).toBe(false);
  await act(async () => {
    ack.resolve(useVideoEditorStore.getState().project!);
  });
  const exit = await waiting;
  expect(exit.receipt).toEqual(receipt);
  expect(exit.isCurrent()).toBe(true);
  expect(useVideoEditorStore.getState().project).not.toHaveProperty('checkpointReceipt');
});

it('invalidates Montage exit before React sees a new gesture or edit', async () => {
  const project = await mountCheckpointProject();
  const receipt = {
    rootKind: 'video-project' as const,
    rootId: project.id,
    revision: '11111111-1111-4111-8111-111111111111',
  };
  checkpointReceiptForSave.mockReturnValue(receipt);
  saveVideoProject.mockImplementation(async (candidate) => candidate);
  act(() => useVideoEditorStore.getState().renameProject('Saved before exit'));
  await flushAutoSaveTimers();
  const exit = await prepareVideoEditorCheckpointExit(project.id);
  let active = true;
  act(() => {
    const lease = useVideoEditorStore.getState().beginProjectHistoryTransaction();
    if (!lease) throw new Error('Expected new gesture');
    active = exit.isCurrent();
    useVideoEditorStore.getState().endProjectHistoryTransaction(lease);
  });
  expect(active).toBe(false);
  const afterGesture = await prepareVideoEditorCheckpointExit(project.id);
  let unchanged = true;
  act(() => {
    useVideoEditorStore.getState().renameProject('New edit in extra intent gap');
    unchanged = afterGesture.isCurrent();
  });
  expect(unchanged).toBe(false);
});

it('clears Montage receipt on ACK omission and rejects retired witnesses', async () => {
  const project = await mountCheckpointProject();
  const receipt = {
    rootKind: 'video-project' as const,
    rootId: project.id,
    revision: '11111111-1111-4111-8111-111111111111',
  };
  checkpointReceiptForSave.mockReturnValueOnce(receipt);
  saveVideoProject.mockImplementation(async (candidate) => candidate);
  act(() => useVideoEditorStore.getState().renameProject('First ACK'));
  await flushAutoSaveTimers();
  const first = await prepareVideoEditorCheckpointExit(project.id);
  expect(first.receipt).toEqual(receipt);
  act(() => useVideoEditorStore.getState().renameProject('Legacy ACK without receipt'));
  await flushAutoSaveTimers();
  const second = await prepareVideoEditorCheckpointExit(project.id);
  expect(second.receipt).toBeNull();
  expect(second.isCurrent()).toBe(true);
  expect(first.isCurrent()).toBe(false);
  act(() =>
    useVideoEditorStore.getState().setProject(createEmptyVideoProject('Replacement context'), null)
  );
  expect(second.isCurrent()).toBe(false);
});

it('rejects a Montage replacement synchronously before its context effect runs', async () => {
  const project = await mountCheckpointProject();
  const exit = await prepareVideoEditorCheckpointExit(project.id);
  expect(exit.receipt).toBeNull();
  expect(exit.isCurrent()).toBe(true);
  let eligible = true;
  act(() => {
    useVideoEditorStore
      .getState()
      .setProject(createEmptyVideoProject('Replacement during exit intent'), null);
    eligible = exit.isCurrent();
  });
  expect(eligible).toBe(false);
});

it('does not transfer a retired save receipt to a replacement Montage context', async () => {
  const project = await mountCheckpointProject();
  const receipt = {
    rootKind: 'video-project' as const,
    rootId: project.id,
    revision: '11111111-1111-4111-8111-111111111111',
  };
  checkpointReceiptForSave.mockReturnValueOnce(receipt);
  const ack = checkpointDeferred<ReturnType<typeof createEmptyVideoProject>>();
  saveVideoProject.mockImplementationOnce(() => ack.promise);
  act(() => useVideoEditorStore.getState().renameProject('Old native write'));
  await flushAutoSaveTimers();
  const old = useVideoEditorStore.getState().project!;
  const replacement = createEmptyVideoProject('New clean context');
  act(() => useVideoEditorStore.getState().setProject(replacement, null));
  await act(async () => {
    ack.resolve(old);
  });
  const exit = await prepareVideoEditorCheckpointExit(replacement.id);
  expect(exit.receipt).toBeNull();
  expect(exit.isCurrent()).toBe(true);
});

it('rejects a Montage source edit during the extra exit-intent gap', async () => {
  const project = await mountCheckpointProject();
  const exit = await prepareVideoEditorCheckpointExit(project.id);
  let eligible = true;
  act(() => {
    useVideoEditorStore
      .getState()
      .updateProject((current) => ({ ...current, baseRecordingId: 'replacement-source' }));
    eligible = exit.isCurrent();
  });
  expect(eligible).toBe(false);
});
