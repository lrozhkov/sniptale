// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const savedViewMocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  move: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../composition/persistence/gallery-saved-views', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/gallery-saved-views')>()),
  createGallerySavedView: savedViewMocks.create,
  deleteGallerySavedView: savedViewMocks.delete,
  listGallerySavedViews: savedViewMocks.list,
  moveGallerySavedView: savedViewMocks.move,
  updateGallerySavedView: savedViewMocks.update,
}));
import { useGalleryFilterState } from './useGalleryFilterState';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof useGalleryFilterState> | null = null;

function HookProbe() {
  latestValue = useGalleryFilterState();
  return null;
}

function renderHook() {
  act(() => {
    root?.render(<HookProbe />);
  });

  if (!latestValue) {
    throw new Error('Expected gallery filter state');
  }

  return latestValue;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latestValue = null;
  window.localStorage.clear();
  savedViewMocks.list.mockResolvedValue([]);
  savedViewMocks.delete.mockResolvedValue(undefined);
  savedViewMocks.move.mockResolvedValue([]);
});

it('restores the last user-selected section and filters from local UI storage', () => {
  window.localStorage.setItem(
    'sniptale.gallery.filters',
    JSON.stringify({
      activeTags: ['alpha'],
      facetFilters: {
        created: ['today'],
        duration: [],
        format: ['png'],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      folderFilter: 'screenshot',
      scope: 'library',
      version: 1,
    })
  );

  const value = renderHook();

  expect(value.state.folderFilter).toBe('screenshot');
  expect(value.state.scope).toBe('library');
  expect(value.state.activeTags).toEqual(['alpha']);
  expect(value.state.facetFilters.created).toEqual(['today']);
  expect(value.state.facetFilters.format).toEqual(['png']);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  window.history.replaceState(null, '', '/');
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('starts with canonical gallery filter defaults', () => {
  const value = renderHook();

  expect(value.state.folderFilter).toBe('all');
  expect(value.state.sortMode).toBe('newest');
  expect(value.state.search).toBe('');
  expect(value.state.scope).toBe('all');
  expect(value.state.activeTags).toEqual([]);
  expect(value.state.facetFilters).toEqual({
    created: [],
    duration: [],
    format: [],
    resolution: [],
    size: [],
    source: [],
    updated: [],
  });
  expect(Array.from(value.state.selectedIds)).toEqual([]);
  expect(value.state.selectionTagDraft).toBe('');
});

it('can start on the web snapshot folder from the gallery URL', () => {
  window.history.replaceState(null, '', '/gallery.html?folder=web-snapshot');

  const value = renderHook();

  expect(value.state.folderFilter).toBe('web-snapshot');
});

it('can start in the temporary scope from the gallery URL', () => {
  window.history.replaceState(null, '', '/gallery.html?scope=temporary');

  const value = renderHook();

  expect(value.state.scope).toBe('temporary');
});

it('treats a recording route as a preview intent instead of a persistent filter', () => {
  window.history.replaceState(
    null,
    '',
    '/gallery.html?folder=recording&recordingId=rec-1&scope=temporary'
  );

  const value = renderHook();

  expect(value.state.folderFilter).toBe('all');
  expect(value.state.scope).toBe('all');
});

it('updates filter state through each owner-local setter', () => {
  const value = renderHook();

  act(() => {
    value.actions.setFolderFilter('recording');
    value.actions.setSortMode('size-desc');
    value.actions.setSearch('clip');
    value.actions.setActiveTags(['alpha']);
    value.actions.setFacetFilter('format', ['png']);
    value.actions.setSelectedIds(new Set(['asset-1']));
    value.actions.setSelectionTagDraft('draft-tag');
  });

  const next = latestValue;
  expect(next?.state.folderFilter).toBe('recording');
  expect(next?.state.sortMode).toBe('size-desc');
  expect(next?.state.search).toBe('clip');
  expect(next?.state.activeTags).toEqual(['alpha']);
  expect(next?.state.facetFilters.format).toEqual(['png']);
  expect(Array.from(next?.state.selectedIds ?? [])).toEqual(['asset-1']);
  expect(next?.state.selectionTagDraft).toBe('draft-tag');
});

it('persists user filter changes for the next Gallery visit', async () => {
  const value = renderHook();

  act(() => {
    value.actions.setFolderFilter('recording');
    value.actions.setScope('temporary');
    value.actions.setActiveTags(['review']);
    value.actions.setFacetFilter('duration', ['1-5-minutes']);
  });

  await vi.waitFor(() => {
    const stored = window.localStorage.getItem('sniptale.gallery.filters');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '{}')).toMatchObject({
      activeTags: ['review'],
      facetFilters: { duration: ['1-5-minutes'] },
      folderFilter: 'recording',
      scope: 'temporary',
      version: 1,
    });
  });
});

it('ignores malformed stored filter state', () => {
  window.localStorage.setItem('sniptale.gallery.filters', '{broken');

  const value = renderHook();

  expect(value.state.folderFilter).toBe('all');
  expect(value.state.activeTags).toEqual([]);
});

it('resets faceted navigation to both statuses without changing the media category', () => {
  const value = renderHook();

  act(() => {
    value.actions.setFolderFilter('recording');
    value.actions.setScope('temporary');
    value.actions.setActiveTags(['alpha']);
    value.actions.setFacetFilter('resolution', ['qhd']);
  });
  act(() => {
    latestValue?.actions.resetFilters();
  });

  expect(latestValue?.state.folderFilter).toBe('recording');
  expect(latestValue?.state.scope).toBe('all');
  expect(latestValue?.state.activeTags).toEqual([]);
  expect(latestValue?.state.facetFilters).toEqual({
    created: [],
    duration: [],
    format: [],
    resolution: [],
    size: [],
    source: [],
    updated: [],
  });
});

it('loads a saved view, keeps unavailable values selected, and resets changes to its baseline', async () => {
  const view = {
    createdAt: 1,
    filters: {
      activeTags: ['missing-tag'],
      facetFilters: {
        created: [],
        duration: [],
        format: ['legacy-format'],
        resolution: [],
        size: [],
        source: ['missing.example'],
        updated: [],
      },
      scope: 'library' as const,
    },
    folderFilter: 'screenshot' as const,
    id: 'view-1',
    name: 'Legacy sources',
    updatedAt: 1,
  };
  savedViewMocks.list.mockResolvedValue([view]);
  renderHook();
  await vi.waitFor(() => expect(latestValue?.state.savedViewsLoaded).toBe(true));

  act(() => latestValue?.actions.selectSavedView(view.id));
  expect(latestValue?.state.activeSavedView?.id).toBe(view.id);
  expect(latestValue?.state.facetFilters.source).toEqual(['missing.example']);

  act(() => latestValue?.actions.setFacetFilter('source', []));
  expect(latestValue?.state.isSavedViewDirty).toBe(true);
  act(() => latestValue?.actions.resetFilters());
  expect(latestValue?.state.facetFilters.source).toEqual(['missing.example']);
  expect(latestValue?.state.isSavedViewDirty).toBe(false);
});

it('resets saved-view filters when a plain category is selected', async () => {
  const view = {
    createdAt: 1,
    filters: {
      activeTags: ['review'],
      facetFilters: {
        created: ['today'],
        duration: [],
        format: ['png'],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      scope: 'library' as const,
    },
    folderFilter: 'screenshot' as const,
    id: 'view-1',
    name: 'Review',
    updatedAt: 1,
  };
  savedViewMocks.list.mockResolvedValue([view]);
  renderHook();
  await vi.waitFor(() => expect(latestValue?.state.savedViewsLoaded).toBe(true));

  act(() => latestValue?.actions.selectSavedView(view.id));
  act(() => latestValue?.actions.setFolderFilter('recording'));

  expect(latestValue?.state.activeSavedView).toBeNull();
  expect(latestValue?.state.folderFilter).toBe('recording');
  expect(latestValue?.state.scope).toBe('all');
  expect(latestValue?.state.activeTags).toEqual([]);
  expect(latestValue?.state.facetFilters).toEqual({
    created: [],
    duration: [],
    format: [],
    resolution: [],
    size: [],
    source: [],
    updated: [],
  });
});

it('creates, updates, and deletes an active saved view through the authoritative owner', async () => {
  const view = {
    createdAt: 1,
    filters: {
      activeTags: [],
      facetFilters: {
        created: [],
        duration: [],
        format: ['png'],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      scope: 'all' as const,
    },
    folderFilter: 'screenshot' as const,
    id: 'view-1',
    name: 'PNG',
    updatedAt: 1,
  };
  savedViewMocks.create.mockResolvedValue(view);
  savedViewMocks.update.mockResolvedValue({
    ...view,
    filters: { ...view.filters, activeTags: ['approved'] },
    updatedAt: 2,
  });
  renderHook();
  await vi.waitFor(() => expect(latestValue?.state.savedViewsLoaded).toBe(true));
  act(() => {
    latestValue?.actions.setFolderFilter('screenshot');
    latestValue?.actions.setFacetFilter('format', ['png']);
  });

  await act(async () => {
    await latestValue?.actions.createSavedView('PNG');
  });
  expect(savedViewMocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ folderFilter: 'screenshot', name: 'PNG' })
  );
  expect(latestValue?.state.activeSavedView?.id).toBe('view-1');

  act(() => latestValue?.actions.setActiveTags(['approved']));
  await act(async () => {
    await latestValue?.actions.updateSavedView();
  });
  expect(latestValue?.state.isSavedViewDirty).toBe(false);

  savedViewMocks.move.mockResolvedValue([view]);
  await act(async () => {
    await latestValue?.actions.moveSavedView('view-1', 'up');
  });
  expect(savedViewMocks.move).toHaveBeenCalledWith('view-1', 'up');

  await act(async () => {
    await latestValue?.actions.deleteSavedView('view-1');
  });
  expect(savedViewMocks.delete).toHaveBeenCalledWith('view-1');
  expect(latestValue?.state.activeSavedView).toBeNull();
  expect(latestValue?.state.folderFilter).toBe('screenshot');
  expect(latestValue?.state.facetFilters.format).toEqual([]);
});

it('surfaces a saved-view load failure without overwriting the current filters', async () => {
  savedViewMocks.list.mockRejectedValueOnce(new Error('storage unavailable'));
  const value = renderHook();

  await vi.waitFor(() => expect(latestValue?.state.savedViewsLoaded).toBe(true));
  expect(latestValue?.state.savedViewsLoadFailed).toBe(true);
  expect(value.state.folderFilter).toBe('all');
});

it('reloads restored saved views and reapplies the active authoritative baseline', async () => {
  const original = {
    createdAt: 1,
    filters: {
      activeTags: ['before'],
      facetFilters: {
        created: [],
        duration: [],
        format: ['png'],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      scope: 'library' as const,
    },
    folderFilter: 'screenshot' as const,
    id: 'view-1',
    name: 'Restored view',
    updatedAt: 1,
  };
  savedViewMocks.list.mockResolvedValueOnce([original]);
  renderHook();
  await vi.waitFor(() => expect(latestValue?.state.savedViewsLoaded).toBe(true));
  act(() => latestValue?.actions.selectSavedView(original.id));

  const restored = {
    ...original,
    filters: { ...original.filters, activeTags: ['restored'] },
    updatedAt: 2,
  };
  savedViewMocks.list.mockResolvedValueOnce([restored]);
  await act(async () => {
    await latestValue?.actions.reloadSavedViews();
  });

  expect(latestValue?.state.activeSavedView).toEqual(restored);
  expect(latestValue?.state.activeTags).toEqual(['restored']);
  expect(latestValue?.state.isSavedViewDirty).toBe(false);
});

it('clears a stale active saved-view identity after loading the authoritative list', async () => {
  window.localStorage.setItem(
    'sniptale.gallery.filters',
    JSON.stringify({
      activeSavedViewId: 'missing-view',
      activeTags: [],
      facetFilters: {
        created: [],
        duration: [],
        format: [],
        resolution: [],
        size: [],
        source: [],
        updated: [],
      },
      folderFilter: 'all',
      scope: 'all',
      version: 1,
    })
  );
  renderHook();

  await vi.waitFor(() => expect(latestValue?.state.savedViewsLoaded).toBe(true));
  await vi.waitFor(() =>
    expect(
      JSON.parse(window.localStorage.getItem('sniptale.gallery.filters') ?? '{}')
    ).toMatchObject({ activeSavedViewId: null })
  );
});
