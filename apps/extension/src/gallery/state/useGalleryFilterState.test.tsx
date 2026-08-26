// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
