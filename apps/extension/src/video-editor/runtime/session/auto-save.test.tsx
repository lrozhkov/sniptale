// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';

const saveVideoProject = vi.fn();
const replaceVideoEditorUrl = vi.fn();

vi.mock('../../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: saveVideoProject,
}));

vi.mock('../browser-driver', () => ({
  replaceVideoEditorUrl,
}));

async function importAutoSaveHook() {
  return (await import('./auto-save')).useVideoEditorAutoSave;
}

function renderAutoSaveHarness(props: {
  project: ReturnType<typeof createEmptyVideoProject>;
  projectId: string | null;
  refreshProjects: () => Promise<void>;
  root: Root | null;
  setSaveState: (state: 'saved' | 'saving' | 'error' | 'idle') => void;
  syncProjectRevision?: (
    updater: (
      project: ReturnType<typeof createEmptyVideoProject>
    ) => ReturnType<typeof createEmptyVideoProject>
  ) => void;
  useVideoEditorAutoSave: (typeof import('./auto-save'))['useVideoEditorAutoSave'];
}) {
  const Harness = () => {
    props.useVideoEditorAutoSave(
      props.project,
      props.projectId,
      props.setSaveState,
      props.refreshProjects,
      props.syncProjectRevision
    );
    return null;
  };

  act(() => {
    props.root?.render(<Harness />);
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
  replaceVideoEditorUrl.mockReset();
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
  vi.useRealTimers();
});

it('saves the project after the debounce and refreshes project metadata', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Autosave');
  const setSaveState = vi.fn<(state: 'saved' | 'saving' | 'error' | 'idle') => void>();
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

  expect(setSaveState).toHaveBeenCalledWith('saving');
  await flushAutoSaveTimers();

  expect(saveVideoProject).toHaveBeenCalledWith(project, { baseRevision: project.updatedAt });
  expect(setSaveState).toHaveBeenCalledWith('saved');
  expect(replaceVideoEditorUrl).toHaveBeenCalledWith(project.id, 'rec-1');
  expect(refreshProjects).toHaveBeenCalledTimes(1);
});

it('uses the last persisted revision for subsequent autosaves', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Autosave revision');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState = vi.fn<(state: 'saved' | 'saving' | 'error' | 'idle') => void>();
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
  currentProject = { ...project, name: 'Autosave revision edited' };
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();

  expect(saveVideoProject).toHaveBeenNthCalledWith(1, project, {
    baseRevision: project.updatedAt,
  });
  expect(saveVideoProject).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ name: 'Autosave revision edited' }),
    { baseRevision: 200 }
  );
});

it('syncs the saved revision into editor state without triggering a duplicate autosave', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  let currentProject = createEmptyVideoProject('Autosave revision sync');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState = vi.fn<(state: 'saved' | 'saving' | 'error' | 'idle') => void>();
  const syncProjectRevision = vi.fn(
    (updater: (project: typeof currentProject) => typeof currentProject) => {
      currentProject = updater(currentProject);
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
  act(() => {
    root?.render(<Harness />);
  });
  await flushAutoSaveTimers();

  expect(syncProjectRevision).toHaveBeenCalledOnce();
  expect(currentProject.updatedAt).toBe(200);
  expect(saveVideoProject).toHaveBeenCalledTimes(1);
});

it('queues overlapping same-project autosaves behind the persisted revision update', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Autosave overlap');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState = vi.fn<(state: 'saved' | 'saving' | 'error' | 'idle') => void>();
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
    { baseRevision: 200 }
  );
});

it('marks the save state as error when persistence fails', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Broken autosave');
  const setSaveState = vi.fn<(state: 'saved' | 'saving' | 'error' | 'idle') => void>();

  saveVideoProject.mockRejectedValue(new Error('persist failed'));
  renderAutoSaveHarness({
    project,
    projectId: null,
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });

  await flushAutoSaveTimers();

  expect(setSaveState).toHaveBeenCalledWith('error');
});

it('ignores stale save completions after the editor switches to a newer project', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const projectA = createEmptyVideoProject('Project A');
  const projectB = createEmptyVideoProject('Project B');
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  const setSaveState = vi.fn<(state: 'saved' | 'saving' | 'error' | 'idle') => void>();
  let resolveFirstSave: (() => void) | null = null;

  saveVideoProject.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
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
  await flushAutoSaveTimers();
  renderAutoSaveHarness({
    project: projectB,
    projectId: 'rec-b',
    refreshProjects,
    root,
    setSaveState,
    useVideoEditorAutoSave,
  });
  await flushAutoSaveTimers();
  await act(async () => {
    resolveFirstSave?.();
    await Promise.resolve();
  });

  expect(replaceVideoEditorUrl).toHaveBeenLastCalledWith(projectB.id, 'rec-b');
  expect(refreshProjects).toHaveBeenCalledTimes(1);
});
