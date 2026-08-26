import { useState } from 'react';
import type {
  FolderFilter,
  GalleryFacetFilterId,
  GalleryFacetFilters,
  GalleryScope,
  SortMode,
} from './types';

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

function getInitialFolderFilter(): FolderFilter {
  const params = new URLSearchParams(window.location.search);
  if (params.has('recordingId')) return 'all';
  const folder = params.get('folder');
  return GALLERY_FOLDERS.has(folder as FolderFilter) ? (folder as FolderFilter) : 'all';
}

function getInitialScope(): GalleryScope {
  const params = new URLSearchParams(window.location.search);
  if (params.has('recordingId')) return 'all';
  const scope = params.get('scope');
  return scope === 'temporary' || scope === 'library' ? scope : 'all';
}

export function useGalleryFilterState() {
  const [folderFilter, setFolderFilter] = useState<FolderFilter>(getInitialFolderFilter);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<GalleryScope>(getInitialScope);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [facetFilters, setFacetFilters] = useState<GalleryFacetFilters>(EMPTY_FACET_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionTagDraft, setSelectionTagDraft] = useState('');

  return {
    actions: {
      setActiveTags,
      setFolderFilter,
      setFacetFilter: (id: GalleryFacetFilterId, values: string[]) =>
        setFacetFilters((previous) => ({ ...previous, [id]: values })),
      resetFilters: () => {
        setScope('all');
        setActiveTags([]);
        setFacetFilters(EMPTY_FACET_FILTERS);
      },
      setSearch,
      setScope,
      setSelectedIds,
      setSelectionTagDraft,
      setSortMode,
    },
    state: {
      activeTags,
      facetFilters,
      folderFilter,
      search,
      scope,
      selectedIds,
      selectionTagDraft,
      sortMode,
    },
  };
}
