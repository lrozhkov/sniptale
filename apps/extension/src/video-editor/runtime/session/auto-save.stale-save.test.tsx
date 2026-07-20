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

it('retries stale autosaves against the latest persisted project revision', async () => {
  const useVideoEditorAutoSave = await importAutoSaveHook();
  const project = createEmptyVideoProject('Autosave stale retry');
  const persistedOnlyAsset = createPersistedOnlyAsset();
  const latestProject = { ...project, assets: [persistedOnlyAsset], updatedAt: 200 };
  const setSaveState = vi.fn<(state: 'saved' | 'saving' | 'error' | 'idle') => void>();

  saveVideoProject.mockRejectedValueOnce(createStaleSaveError()).mockResolvedValueOnce({
    ...project,
    updatedAt: 300,
  });
  getVideoProject.mockResolvedValue({ project: latestProject, status: 'ready' });
  renderAutosaveHarness(project, setSaveState, useVideoEditorAutoSave);

  await flushAutoSaveTimers();

  expect(getVideoProject).toHaveBeenCalledWith(project.id);
  expect(saveVideoProject).toHaveBeenNthCalledWith(1, project, {
    baseRevision: project.updatedAt,
  });
  expect(saveVideoProject).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      assets: [persistedOnlyAsset],
      id: project.id,
      updatedAt: latestProject.updatedAt,
    }),
    { baseRevision: latestProject.updatedAt }
  );
  expect(setSaveState).toHaveBeenCalledWith('saved');
});

function createPersistedOnlyAsset() {
  return {
    createdAt: 100,
    id: 'persisted-asset',
    metadata: {
      duration: 1,
      hasAudio: false,
      height: 1,
      mimeType: 'video/mp4',
      size: 1,
      width: 1,
    },
    name: 'persisted.mp4',
    source: { kind: 'project-asset' as const, projectAssetId: 'persisted-asset' },
    type: 'VIDEO' as const,
  };
}

function createStaleSaveError(): Error {
  return Object.assign(new Error('stale project'), {
    name: 'StaleVideoProjectSaveError',
  });
}

function renderAutosaveHarness(
  project: ReturnType<typeof createEmptyVideoProject>,
  setSaveState: (state: 'saved' | 'saving' | 'error' | 'idle') => void,
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
  setSaveState: (state: 'saved' | 'saving' | 'error' | 'idle') => void;
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
