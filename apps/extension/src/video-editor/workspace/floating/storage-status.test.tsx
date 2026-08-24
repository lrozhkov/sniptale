// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectPresence: vi.fn(() => ({ dispose: vi.fn() })),
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

it('refreshes the saved revision and promotes the same open project', async () => {
  await act(async () => {
    root.render(<VideoProjectStorageStatus />);
    await Promise.resolve();
  });

  expect(mocks.refreshPresentation).toHaveBeenCalledWith('video-1', 20);
  expect(mocks.connectPresence).toHaveBeenCalledWith(
    expect.objectContaining({ aggregate: { id: 'video-1', kind: 'video-project' } })
  );
  const button = container.querySelector<HTMLButtonElement>('button');
  expect(button).not.toBeNull();
  await act(async () => button?.click());

  expect(mocks.promoteOpenProject).toHaveBeenCalledWith('video-1');
  expect(container.querySelector('button')).toBeNull();
});

it('reports promotion failure while keeping the draft action available', async () => {
  mocks.promoteOpenProject.mockRejectedValueOnce(new Error('cover failed'));
  await act(async () => {
    root.render(<VideoProjectStorageStatus />);
    await Promise.resolve();
  });
  const button = container.querySelector<HTMLButtonElement>('button');
  await act(async () => button?.click());

  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.querySelector('button')).not.toBeNull();
});
