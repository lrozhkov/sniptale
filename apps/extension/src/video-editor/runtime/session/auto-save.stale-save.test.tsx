// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';

const getVideoProject = vi.fn();
const saveVideoProject = vi.fn();

vi.mock('../../../composition/persistence/projects/index-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/projects/index-mutations')
  >()),
  commitVideoProjectMutation: saveVideoProject,
  commitVideoProjectWorkspaceMutation: saveVideoProject,
}));

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
  const setSaveState = vi.fn<(state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void>();

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

  expect(getVideoProject).toHaveBeenCalledWith(project.id);
  expect(saveVideoProject).toHaveBeenCalledOnce();
  expect(saveVideoProject).toHaveBeenCalledWith(editedProject, {
    expectedWorkspaceRevision: 4,
  });
  expect(setSaveState).toHaveBeenCalledWith('error');
});

function createStaleSaveError(): Error {
  return Object.assign(new Error('stale project'), {
    name: 'StaleVideoProjectSaveError',
  });
}

function renderAutosaveHarness(
  project: ReturnType<typeof createEmptyVideoProject>,
  setSaveState: (state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void,
  useVideoEditorAutoSave: (typeof import('./auto-save'))['useVideoEditorAutoSave']
) {
  act(() => {
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
  setSaveState: (state: 'saved' | 'dirty' | 'saving' | 'error' | 'idle') => void;
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
