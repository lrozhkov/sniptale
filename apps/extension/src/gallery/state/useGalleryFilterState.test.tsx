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
  expect(value.state.activeTags).toEqual([]);
  expect(Array.from(value.state.selectedIds)).toEqual([]);
  expect(value.state.selectionTagDraft).toBe('');
});

it('can start on the web snapshot folder from the gallery URL', () => {
  window.history.replaceState(null, '', '/gallery.html?folder=web-snapshot');

  const value = renderHook();

  expect(value.state.folderFilter).toBe('web-snapshot');
});

it('updates filter state through each owner-local setter', () => {
  const value = renderHook();

  act(() => {
    value.actions.setFolderFilter('recording');
    value.actions.setSortMode('size');
    value.actions.setSearch('clip');
    value.actions.setActiveTags(['alpha']);
    value.actions.setSelectedIds(new Set(['asset-1']));
    value.actions.setSelectionTagDraft('draft-tag');
  });

  const next = latestValue;
  expect(next?.state.folderFilter).toBe('recording');
  expect(next?.state.sortMode).toBe('size');
  expect(next?.state.search).toBe('clip');
  expect(next?.state.activeTags).toEqual(['alpha']);
  expect(Array.from(next?.state.selectedIds ?? [])).toEqual(['asset-1']);
  expect(next?.state.selectionTagDraft).toBe('draft-tag');
});
