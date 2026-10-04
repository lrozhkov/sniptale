// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaItem,
  createScenarioItem,
  createVideoProjectItem,
} from '../actions/test-support';
import type { MediaAssetProjectUsage } from '../../../composition/persistence/media-library/usage';
import { PreviewProjectUsage } from './sidebar-sections';

const mocks = vi.hoisted(() => ({
  usage: vi.fn(),
  subscribe: vi.fn(),
  video: vi.fn(),
  scenario: vi.fn(),
  gallery: vi.fn(),
}));
vi.mock('../../../composition/persistence/media-library/usage', () => ({
  listPreviewMediaAssetProjectUsage: mocks.usage,
  subscribeToPreviewProjectUsageInvalidation: mocks.subscribe,
}));
vi.mock('../../../platform/navigation/extension-pages', () => ({
  openVideoEditorPage: mocks.video,
  openScenarioEditorPage: mocks.scenario,
  openGalleryPage: mocks.gallery,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscribe.mockReturnValue(() => undefined);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function pendingUsage() {
  let resolve!: (usage: MediaAssetProjectUsage[]) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<MediaAssetProjectUsage[]>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it('shows loading until resolved and exposes all linked project navigation routes', async () => {
  const pending = pendingUsage();
  mocks.usage.mockReturnValue(pending.promise);
  await act(async () =>
    root.render(
      <PreviewProjectUsage item={createMediaItem({ id: 'display-id', entityId: 'media-id' })} />
    )
  );
  expect(mocks.usage).toHaveBeenCalledExactlyOnceWith('media-id');
  expect(container.textContent).toContain('gallery.preview.projectsLoading');
  expect(container.querySelectorAll('button')).toHaveLength(0);
  await act(async () =>
    pending.resolve([
      { id: 'video-1', name: 'Video project', kind: 'video', primary: true },
      { id: 'scenario-1', name: 'Scenario project', kind: 'scenario', primary: false },
      { id: 'review-1', name: 'Review workspace', kind: 'review', primary: false },
    ])
  );
  expect(container.textContent).not.toContain('gallery.preview.projectsLoading');
  expect(container.querySelector('section')?.getAttribute('aria-label')).toBe(
    'gallery.preview.usedInProjects'
  );
  const buttons = [...container.querySelectorAll('button')];
  expect(buttons.map((button) => button.textContent)).toEqual([
    'Video project',
    'Scenario project',
    'Review workspace',
  ]);
  await act(async () => buttons.forEach((button) => button.click()));
  expect(mocks.video).toHaveBeenCalledExactlyOnceWith('video-1', null);
  expect(mocks.scenario).toHaveBeenCalledExactlyOnceWith('scenario-1');
  expect(mocks.gallery).toHaveBeenCalledExactlyOnceWith({ mediaId: 'review-1', quickEdit: true });
});

it('shows linked project names without navigation in Trash', async () => {
  mocks.usage.mockResolvedValue([
    { id: 'video-1', name: 'Video project', kind: 'video', primary: true },
  ]);
  await act(async () => root.render(<PreviewProjectUsage item={createMediaItem()} trashMode />));
  expect(container.textContent).toContain('Video project');
  expect(container.querySelector('button')).toBeNull();
  expect(mocks.video).not.toHaveBeenCalled();
});

it('shows empty usage and uses the item id when entity identity is absent', async () => {
  mocks.usage.mockResolvedValue([]);
  const item = createMediaItem({ id: 'media-fallback' });
  delete item.entityId;
  await act(async () => root.render(<PreviewProjectUsage item={item} />));
  expect(mocks.usage).toHaveBeenCalledExactlyOnceWith('media-fallback');
  expect(container.textContent).toContain('gallery.preview.projectsEmpty');
  expect(container.querySelectorAll('button')).toHaveLength(0);
});

it('shows lookup failure without offering stale project navigation', async () => {
  mocks.usage.mockRejectedValue(new Error('Database unavailable'));
  await act(async () => root.render(<PreviewProjectUsage item={createMediaItem()} />));
  expect(container.textContent).toContain('gallery.preview.projectsUnavailable');
  expect(container.textContent).not.toContain('gallery.preview.projectsLoading');
  expect(container.textContent).not.toContain('gallery.preview.projectsEmpty');
  expect(container.querySelectorAll('button')).toHaveLength(0);
});

it.each([createScenarioItem(), createVideoProjectItem()])(
  'omits usage lookup for non-media item $kind',
  async (item) => {
    await act(async () => root.render(<PreviewProjectUsage item={item} />));
    expect(container.textContent).toBe('');
    expect(mocks.usage).not.toHaveBeenCalled();
  }
);

it.each(['resolve', 'reject'] as const)(
  'ignores a stale lookup %s after switching media',
  async (outcome) => {
    const pending = pendingUsage();
    mocks.usage.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([]);
    await act(async () =>
      root.render(<PreviewProjectUsage item={createMediaItem({ entityId: 'old' })} />)
    );
    await act(async () =>
      root.render(<PreviewProjectUsage item={createMediaItem({ entityId: 'current' })} />)
    );
    await act(async () => {
      if (outcome === 'resolve')
        pending.resolve([{ id: 'stale', name: 'Stale project', kind: 'video', primary: false }]);
      else pending.reject(new Error('Stale failure'));
    });
    expect(container.textContent).toContain('gallery.preview.projectsEmpty');
    expect(container.textContent).not.toContain('Stale project');
    expect(container.textContent).not.toContain('gallery.preview.projectsUnavailable');
  }
);

it('reloads on project invalidation and ignores the old result', async () => {
  const pending = pendingUsage();
  mocks.usage.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([]);
  await act(async () => root.render(<PreviewProjectUsage item={createMediaItem()} />));
  const invalidate = mocks.subscribe.mock.calls[0]?.[0];
  expect(invalidate).toBeTypeOf('function');
  await act(async () => invalidate());
  await act(async () =>
    pending.resolve([{ id: 'stale', name: 'Stale project', kind: 'video', primary: false }])
  );
  expect(mocks.usage).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('gallery.preview.projectsEmpty');
  expect(container.textContent).not.toContain('Stale project');
});

it('retries an unavailable usage lookup after a library change', async () => {
  mocks.usage
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce([{ id: 'video', name: 'Video', kind: 'video', primary: false }]);
  await act(async () => root.render(<PreviewProjectUsage item={createMediaItem()} />));
  expect(container.textContent).toContain('gallery.preview.projectsUnavailable');
  const invalidate = mocks.subscribe.mock.calls[0]?.[0];
  await act(async () => invalidate());
  expect(container.textContent).toContain('Video');
  expect(container.textContent).not.toContain('gallery.preview.projectsUnavailable');
});
