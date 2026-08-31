import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  FolderFilter,
  GalleryFacetFilterId,
  GalleryFacetFilters,
  GalleryScope,
  SortMode,
} from './types';
import {
  readGalleryFilterPreferences,
  writeGalleryFilterPreferences,
  type GalleryFilterPreferences,
} from './filter-preferences';
import { useGallerySavedViewState } from './useGallerySavedViewState';

const GALLERY_FOLDERS = new Set<FolderFilter>([
  'all',
  'screenshot',
  'recording',
  'export',
  'web-snapshot',
  'scenario',
]);

const EMPTY_FACET_FILTERS: GalleryFacetFilters = {
  created: [],
  duration: [],
  format: [],
  resolution: [],
  size: [],
  source: [],
  updated: [],
};

function getUrlFolderFilter(): FolderFilter | null {
  const params = new URLSearchParams(window.location.search);
  if (params.has('recordingId')) return 'all';
  const folder = params.get('folder');
  return GALLERY_FOLDERS.has(folder as FolderFilter) ? (folder as FolderFilter) : null;
}

function getUrlScope(): GalleryScope | null {
  const params = new URLSearchParams(window.location.search);
  if (params.has('recordingId')) return 'all';
  const scope = params.get('scope');
  return scope === 'temporary' || scope === 'library' ? scope : null;
}

function getInitialFilterPreferences(): GalleryFilterPreferences {
  const stored = readGalleryFilterPreferences();
  const defaults = {
    activeSavedViewId: null,
    activeTags: [],
    facetFilters: EMPTY_FACET_FILTERS,
    folderFilter: 'all',
    scope: 'all',
  } satisfies GalleryFilterPreferences;
  if (new URLSearchParams(window.location.search).has('recordingId')) return defaults;
  const base = stored ?? defaults;
  return {
    ...base,
    folderFilter: getUrlFolderFilter() ?? base.folderFilter,
    scope: getUrlScope() ?? base.scope,
  };
}

function resolveStateAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (value: T) => T)(current) : action;
}

export function useGalleryFilterState() {
  const [filterPreferences, setFilterPreferences] = useState(getInitialFilterPreferences);
  const filterPreferencesRef = useRef(filterPreferences);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionTagDraft, setSelectionTagDraft] = useState('');
  const updateFilterPreferences = useCallback(
    (update: (value: GalleryFilterPreferences) => GalleryFilterPreferences) => {
      const next = update(filterPreferencesRef.current);
      filterPreferencesRef.current = next;
      setFilterPreferences(next);
      void writeGalleryFilterPreferences(next);
    },
    []
  );
  const savedViewState = useGallerySavedViewState({
    filterPreferences,
    filterPreferencesRef,
    updateFilterPreferences,
  });
  const setFolderFilter: Dispatch<SetStateAction<FolderFilter>> = (action) =>
    updateFilterPreferences((current) => ({
      ...current,
      activeSavedViewId: null,
      activeTags: [],
      facetFilters: EMPTY_FACET_FILTERS,
      folderFilter: resolveStateAction(action, current.folderFilter),
      scope: 'all',
    }));
  const setScope: Dispatch<SetStateAction<GalleryScope>> = (action) =>
    updateFilterPreferences((current) => ({
      ...current,
      scope: resolveStateAction(action, current.scope),
    }));
  const setActiveTags: Dispatch<SetStateAction<string[]>> = (action) =>
    updateFilterPreferences((current) => ({
      ...current,
      activeTags: resolveStateAction(action, current.activeTags),
    }));

  return {
    actions: {
      ...savedViewState.actions,
      setActiveTags,
      setFolderFilter,
      setFacetFilter: (id: GalleryFacetFilterId, values: string[]) =>
        updateFilterPreferences((current) => ({
          ...current,
          facetFilters: { ...current.facetFilters, [id]: values },
        })),
      resetFilters: () => {
        if (!savedViewState.resetToSavedView()) {
          updateFilterPreferences((current) => ({
            ...current,
            activeTags: [],
            facetFilters: EMPTY_FACET_FILTERS,
            scope: 'all',
          }));
        }
      },
      setSearch,
      setScope,
      setSelectedIds,
      setSelectionTagDraft,
      setSortMode,
    },
    state: {
      ...savedViewState.state,
      activeTags: filterPreferences.activeTags,
      facetFilters: filterPreferences.facetFilters,
      folderFilter: filterPreferences.folderFilter,
      search,
      scope: filterPreferences.scope,
      selectedIds,
      selectionTagDraft,
      sortMode,
    },
  };
}
