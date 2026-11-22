// @vitest-environment jsdom
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorStore } from '../../state/store';
import type { VideoProject } from '../../../features/video/project/types';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';

const getVideoProject = vi.fn();
const saveVideoProject = vi.fn();

const prepareWorkspace = vi.fn();
let openingProject: VideoProject | null = null;
let openingRevision = 4;
vi.mock('../../../composition/persistence/projects/workspace-commit', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/workspace-commit')
  >()),
  prepareVideoProjectWorkspaceCommit: prepareWorkspace,
}));

function bindProject(project: VideoProject) {
  if (useVideoEditorStore.getState().nativeWorkspace?.project.id !== project.id) {
    useVideoEditorStore.getState().setProject(project, null, {
      status: 'ready',
      project: openingProject ?? project,
      workspaceRevision: openingRevision,
      history: { status: 'absent' },
    });
    const nativeWorkspace = useVideoEditorStore.getState().nativeWorkspace;
    if (nativeWorkspace)
      useVideoEditorStore.setState({
        nativeWorkspace: { ...nativeWorkspace, savedRuntimeProject: project },
      });
  }
  useVideoEditorStore.setState({ project });
}

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  getVideoProject,
}));

vi.mock('../browser-driver', () => ({
  replaceVideoEditorUrl: vi.fn(),
}));

async function importAutoSaveHook() {
  return (await import('./auto-save')).useVideoEditorAutoSave;
}

beforeAll(async () => {
  await importAutoSaveHook();
});

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
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
  openingProject = null;
  openingRevision = 4;
  prepareWorkspace.mockReset().mockImplementation(async (input) => async () => ({
    ...(await saveVideoProject(input.project, {
      expectedWorkspaceRevision: input.expectedWorkspaceRevision,
      expectedProject: input.expectedProject,
    })),
    historyAssetsByValue: new Map(),
  }));
  getVideoProject.mockReset();
  saveVideoProject.mockReset();
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

it('rejects a stale autosave without rebasing it onto the latest persisted project', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Autosave stale retry');
  const setSaveState =
    vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void>();

  saveVideoProject.mockRejectedValueOnce(createStaleSaveError());
  getVideoProject.mockResolvedValue({
    project,
    status: 'ready',
    workspaceRevision: 4,
  });
  renderAutosaveHarness(project, setSaveState, useVideoEditorAutoSave);
  const editedProject = { ...project, name: 'Autosave stale retry edited' };
  renderAutosaveHarness(editedProject, setSaveState, useVideoEditorAutoSave);

  await flushAutoSaveTimers();

  expect(getVideoProject).not.toHaveBeenCalled();
  expect(saveVideoProject).toHaveBeenCalledOnce();
  expect(saveVideoProject).toHaveBeenCalledWith(editedProject, {
    expectedWorkspaceRevision: 4,
    expectedProject: project,
  });
  expect(setSaveState).toHaveBeenCalledWith('conflict');
});

function createStaleSaveError(): Error {
  return Object.assign(new Error('stale project'), {
    name: 'StaleVideoProjectSaveError',
  });
}

function renderAutosaveHarness(
  project: ReturnType<typeof createEmptyVideoProject>,
  setSaveState: (state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void,
  useVideoEditorAutoSave: (typeof import('./auto-save'))['useVideoEditorAutoSave']
) {
  act(() => {
    bindProject(project);
    root?.render(
      <AutosaveHarness
        project={project}
        setSaveState={setSaveState}
        useVideoEditorAutoSave={useVideoEditorAutoSave}
      />
    );
  });
}

function AutosaveHarness(props: {
  project: ReturnType<typeof createEmptyVideoProject>;
  setSaveState: (state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void;
  useVideoEditorAutoSave: (typeof import('./auto-save'))['useVideoEditorAutoSave'];
}) {
  props.useVideoEditorAutoSave(
    props.project,
    'rec-1',
    props.setSaveState,
    vi.fn().mockResolvedValue(undefined)
  );
  return null;
}

it('refuses a restored initial snapshot with the same timestamp before calling the writer', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Initial voice project');
  const setSaveState = vi.fn();
  prepareWorkspace.mockRejectedValueOnce(createStaleSaveError());
  getVideoProject.mockResolvedValue({
    status: 'ready',
    project: { ...project, name: 'Restored project' },
    workspaceRevision: 4,
  });
  renderAutosaveHarness(project, setSaveState, useVideoEditorAutoSave);
  renderAutosaveHarness({ ...project, name: 'Voice take' }, setSaveState, useVideoEditorAutoSave);
  await flushAutoSaveTimers();
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(setSaveState).toHaveBeenLastCalledWith('conflict');
  renderAutosaveHarness({ ...project, name: 'Another edit' }, setSaveState, useVideoEditorAutoSave);
  await flushAutoSaveTimers();
  expect(saveVideoProject).not.toHaveBeenCalled();
});

it('does not recreate a deleted initial project from a mounted buffer', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Deleted voice project');
  const setSaveState = vi.fn();
  prepareWorkspace.mockRejectedValueOnce(createStaleSaveError());
  getVideoProject.mockResolvedValue({ status: 'notFound' });
  renderAutosaveHarness(project, setSaveState, useVideoEditorAutoSave);
  renderAutosaveHarness({ ...project, name: 'Voice take' }, setSaveState, useVideoEditorAutoSave);
  await flushAutoSaveTimers();
  expect(saveVideoProject).not.toHaveBeenCalled();
  expect(setSaveState).toHaveBeenLastCalledWith('conflict');
});

it('keeps the initial legacy label projection when the locale changes before the first Save', async () => {
  const locale = await import('../../../platform/i18n/locale/state');
  const currentLocale = vi.spyOn(locale, 'getCurrentLocale').mockReturnValue('ru');
  const { hydrateVideoProject } = await import('../../../features/video/project/hydration');
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const stored = createEmptyVideoProject('Legacy voice project');
  stored.tracks[0]!.name = 'Primary Video';
  const opened = hydrateVideoProject(stored);
  expect(opened.tracks[0]!.name).not.toBe('Primary Video');
  openingProject = stored;
  getVideoProject.mockResolvedValue({ status: 'ready', project: stored, workspaceRevision: 4 });
  saveVideoProject.mockResolvedValue({
    project: { ...opened, name: 'Voice take', updatedAt: opened.updatedAt + 1 },
    workspaceRevision: 5,
  });
  const setSaveState = vi.fn();
  renderAutosaveHarness(opened, setSaveState, useVideoEditorAutoSave);
  currentLocale.mockReturnValue('en');
  const edited = { ...opened, name: 'Voice take' };
  renderAutosaveHarness(edited, setSaveState, useVideoEditorAutoSave);
  await flushAutoSaveTimers();
  expect(saveVideoProject).toHaveBeenCalledExactlyOnceWith(edited, {
    expectedWorkspaceRevision: 4,
    expectedProject: stored,
  });
  expect(setSaveState).toHaveBeenLastCalledWith('saved');
});

it('uses the last persisted revision for subsequent autosaves', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Autosave revision');
  openingRevision = 0;
  const refreshProjects = vi.fn().mockResolvedValue(undefined);
  getVideoProject.mockResolvedValue({ status: 'ready', project, workspaceRevision: 0 });
  const setSaveState =
    vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle' | 'conflict') => void>();
  let currentProject = project;
  const Harness = () => {
    bindProject(currentProject);
    useVideoEditorAutoSave(currentProject, 'rec-1', setSaveState, refreshProjects);
    return null;
  };

  saveVideoProject
    .mockResolvedValueOnce({ project: { ...project, updatedAt: 200 }, workspaceRevision: 1 })
    .mockResolvedValueOnce({ project: { ...project, updatedAt: 300 }, workspaceRevision: 2 });
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
    { expectedWorkspaceRevision: 0, expectedProject: project }
  );
  expect(saveVideoProject).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ name: 'Autosave revision edited' }),
    { expectedWorkspaceRevision: 1, expectedProject: { ...project, updatedAt: 200 } }
  );
});
