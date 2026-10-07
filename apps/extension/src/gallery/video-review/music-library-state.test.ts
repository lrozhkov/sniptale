// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import type { GallerySavedView } from '../../composition/persistence/gallery-saved-views';
import { useMusicLibraryState } from './music-library-state';

const io = vi.hoisted(() => ({ media: vi.fn(), views: vi.fn() }));
vi.mock('../../composition/persistence/media-library', () => ({ listMediaLibrary: io.media }));
vi.mock('../../composition/persistence/gallery-saved-views', () => ({
  listGallerySavedViews: io.views,
}));
let root: Root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
  let current!: ReturnType<typeof useMusicLibraryState>;
  function Harness() {
    current = useMusicLibraryState();
    return null;
  }
  await act(async () => root.render(createElement(Harness)));
  return {
    get current() {
      return current;
    },
  };
}
function audio(id: string): MediaLibraryItem {
  return {
    id,
    kind: 'audio',
    filename: id,
    originalFilename: id,
    createdAt: 1,
    updatedAt: 1,
    mimeType: 'audio/webm',
    size: 10,
    width: null,
    height: null,
    duration: null,
    source: { kind: 'project-asset', projectAssetId: id },
    tags: [],
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    hasThumbnail: false,
  };
}
function view(id: string, folderFilter: GallerySavedView['folderFilter']): GallerySavedView {
  return {
    id,
    name: id,
    folderFilter,
    createdAt: 1,
    updatedAt: 1,
    filters: {
      activeTags: ['music'],
      scope: 'all',
      facetFilters: {
        created: [],
        updated: [],
        format: [],
        size: [],
        resolution: [],
        duration: [],
        source: [],
      },
    },
  };
}
it('intersects saved filters with active audio without decoding media', async () => {
  io.media.mockResolvedValue([
    { ...audio('song'), tags: ['music'] },
    audio('voice'),
    { ...audio('image'), kind: 'image' },
    { ...audio('trash'), lifecycle: { storageClass: 'library', trashedAt: 2 } },
  ]);
  io.views.mockResolvedValue([
    view('all', 'all'),
    view('audio', 'audio'),
    view('images', 'screenshot'),
  ]);
  const result = await mount();
  expect(result.current.status).toBe('ready');
  expect(result.current.visible.map((item) => item.id)).toEqual(['song', 'voice']);
  expect(result.current.views.map((item) => item.id)).toEqual(['all', 'audio']);
  act(() => result.current.setViewId('audio'));
  expect(result.current.visible.map((item) => item.id)).toEqual(['song']);
  act(() => result.current.setQuery('missing'));
  act(() => result.current.applyQuery());
  expect(result.current.visible).toEqual([]);
  expect(result.current.views).toHaveLength(2);
  act(() => result.current.setQuery('song'));
  act(() => result.current.applyQuery());
  expect(result.current.visible).toHaveLength(1);
  expect(io.media).toHaveBeenCalledTimes(1);
});
it('debounces typing and waits until IME composition ends', async () => {
  io.media.mockResolvedValue([audio('song'), audio('voice')]);
  io.views.mockResolvedValue([]);
  const result = await mount();
  expect(result.current.status).toBe('ready');
  vi.useFakeTimers();
  act(() => result.current.setQuery('song'));
  act(() => vi.advanceTimersByTime(249));
  expect(result.current.visible).toHaveLength(2);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.visible).toHaveLength(1);
  act(() => {
    result.current.setComposing(true);
    result.current.setQuery('voice');
  });
  act(() => {
    result.current.applyQuery();
    vi.advanceTimersByTime(500);
  });
  expect(result.current.visible[0]?.id).toBe('song');
  act(() => result.current.setComposing(false));
  act(() => vi.advanceTimersByTime(250));
  expect(result.current.visible[0]?.id).toBe('voice');
  expect(io.media).toHaveBeenCalledTimes(1);
});
it('retries a failed listing while preserving search and selected filter', async () => {
  io.media.mockRejectedValueOnce(new Error('storage')).mockResolvedValue([audio('song')]);
  io.views.mockResolvedValue([]);
  const result = await mount();
  expect(result.current.status).toBe('failed');
  await act(async () => {
    result.current.setQuery('song');
    result.current.setViewId('saved');
    result.current.retry();
  });
  expect(result.current.status).toBe('ready');
  expect(result.current.query).toBe('song');
  expect(result.current.viewId).toBe('saved');
});
