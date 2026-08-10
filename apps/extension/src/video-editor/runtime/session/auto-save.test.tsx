// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { requestVideoEditorSaveRetry } from './save-retry';
import { useVideoEditorStore } from '../../state/store';

const saveVideoProject = vi.fn();
const getVideoProject = vi.fn();
const replaceVideoEditorUrl = vi.fn();

vi.mock('../../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: saveVideoProject,
  commitVideoProjectWorkspaceMutation: async (
    project: ReturnType<typeof createEmptyVideoProject>,
    options: { expectedWorkspaceRevision: number | null }
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
  project: ReturnType<typeof createEmptyVideoProject>;
  projectId: string | null;
  refreshProjects: () => Promise<void>;
  root: Root | null;
  setSaveState: (state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void;
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
    props.syncProjectRevision
  );
  return null;
}

function renderAutoSaveHarness(props: AutoSaveHarnessProps) {
  act(() => {
    props.root?.render(<AutoSaveHarness {...props} />);
  });
}

async function flushAutoSaveTimers() {
  await act(async () => {
    vi.advanceTimersByTime(350);
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
  getVideoProject.mockResolvedValue({ status: 'notFound' });
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
  const setSaveState = vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void>();
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

  expect(saveVideoProject).toHaveBeenCalledWith(editedProject, { expectedWorkspaceRevision: null });
  expect(setSaveState).toHaveBeenCalledWith('saving');
  expect(setSaveState).toHaveBeenCalledWith('saved');
  expect(replaceVideoEditorUrl).toHaveBeenCalledWith(project.id, 'rec-1');
  expect(refreshProjects).toHaveBeenCalledTimes(1);
});

it('treats a freshly loaded persisted project as saved until it is actually edited', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Already persisted');
  const setSaveState = vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void>();

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

it('uses the last persisted revision for subsequent autosaves', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Autosave revision');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState = vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void>();
  let currentProject = project;
  const Harness = () => {
    useVideoEditorAutoSave(currentProject, 'rec-1', setSaveState, refreshProjects);
    return null;
  };

  saveVideoProject
    .mockResolvedValueOnce({ ...project, updatedAt: 200 })
    .mockResolvedValueOnce({ ...project, updatedAt: 300 });
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();
  currentProject = { ...project, name: 'Autosave revision first edit' };
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();
  currentProject = { ...project, name: 'Autosave revision edited' };
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();

  expect(saveVideoProject).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      name: 'Autosave revision first edit',
    }),
    {
      expectedWorkspaceRevision: null,
    }
  );
  expect(saveVideoProject).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ name: 'Autosave revision edited' }),
    { expectedWorkspaceRevision: 1 }
  );
});

it('syncs the saved revision into editor state without triggering a duplicate autosave', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  let currentProject = createEmptyVideoProject('Autosave revision sync');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState = vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void>();
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
    { expectedWorkspaceRevision: null }
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
  const setSaveState = vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void>();
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
    { expectedWorkspaceRevision: 1 }
  );
});

it('marks the save state as error when persistence fails', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Broken autosave');
  const setSaveState = vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void>();

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
  const setSaveState = vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void>();

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

  act(() => requestVideoEditorSaveRetry());
  expect(setSaveState).toHaveBeenLastCalledWith('dirty');
  await flushAutoSaveTimers();

  expect(saveVideoProject).toHaveBeenCalledTimes(2);
  expect(saveVideoProject).toHaveBeenLastCalledWith(editedProject, {
    expectedWorkspaceRevision: null,
  });
  expect(setSaveState).toHaveBeenLastCalledWith('saved');
});

it('ignores stale save completions after the editor switches to a newer project', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const projectA = createEmptyVideoProject('Project A');
  const projectB = createEmptyVideoProject('Project B');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState = vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void>();
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
