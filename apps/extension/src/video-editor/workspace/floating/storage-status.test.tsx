// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectPresence: vi.fn(
    (_options: { aggregate: { id: string; kind: string }; promote: () => Promise<void> }) => ({
      dispose: vi.fn(),
    })
  ),
  getVideoProject: vi.fn(),
  promoteOpenProject: vi.fn(),
  refreshPresentation: vi.fn(),
  videoState: {
    project: { id: 'video-1', updatedAt: 20 } as { id: string; updatedAt: number } | null,
    saveState: 'saved' as 'dirty' | 'error' | 'saved' | 'saving',
  },
}));

vi.mock('../../../composition/persistence/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects')>()),
  getVideoProject: mocks.getVideoProject,
}));
vi.mock('../../../workflows/aggregate-editor-presence/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/aggregate-editor-presence/client')>()),
  connectAggregateEditorPresence: mocks.connectPresence,
}));
vi.mock('../../runtime/controller/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/store')>()),
  useVideoEditorProjectStorageStatus: () => ({
    projectId: mocks.videoState.project?.id ?? null,
    projectUpdatedAt: mocks.videoState.project?.updatedAt ?? null,
    saveState: mocks.videoState.saveState,
  }),
}));
vi.mock('./storage-promotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storage-promotion')>()),
  promoteOpenVideoProject: mocks.promoteOpenProject,
  refreshSavedVideoProjectPresentation: mocks.refreshPresentation,
}));

import { VideoProjectStorageStatus } from './storage-status';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState(null, '', '/video-editor?project=video-1');
  mocks.getVideoProject.mockResolvedValue({
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 10 },
    status: 'ready',
  });
  mocks.promoteOpenProject.mockResolvedValue(undefined);
  mocks.refreshPresentation.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('silently refreshes the active project without relying on a project URL', async () => {
  window.history.replaceState(null, '', '/video-editor');
  await act(async () => root.render(<VideoProjectStorageStatus />));
  expect(mocks.refreshPresentation).toHaveBeenCalledWith('video-1', 20);
  expect(mocks.connectPresence).toHaveBeenCalledWith(
    expect.objectContaining({ aggregate: { id: 'video-1', kind: 'video-project' } })
  );
  expect(container.childElementCount).toBe(0);
  expect(mocks.getVideoProject).not.toHaveBeenCalled();
  await mocks.connectPresence.mock.calls[0]![0].promote();
  expect(mocks.promoteOpenProject).toHaveBeenCalledWith('video-1');
});

it('keeps advisory cover failures silent without blocking the saved project', async () => {
  mocks.refreshPresentation.mockRejectedValueOnce(new Error('cover failed'));
  await act(async () => root.render(<VideoProjectStorageStatus />));
  expect(container.childElementCount).toBe(0);
  expect(mocks.promoteOpenProject).not.toHaveBeenCalled();
});
