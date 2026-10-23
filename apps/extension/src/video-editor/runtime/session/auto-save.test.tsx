// @vitest-environment jsdom
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject as createDomainProject } from '../../../features/video/project/factories/creation';
import { requestVideoEditorSaveRetry } from './save-retry';
import { useVideoEditorStore } from '../../state/store';
import { observeVideoEditorSave, waitForVideoEditorSave } from './save-readiness';

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
  ) => ({
    project: await saveVideoProject(project, options),
    workspaceRevision: (options.expectedWorkspaceRevision ?? 0) + 1,
  }),
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
  vi.useFakeTimers();
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
