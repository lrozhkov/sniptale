import { useState } from 'react';
import type { FolderFilter, GalleryScope, SortMode } from './types';

const GALLERY_FOLDERS = new Set<FolderFilter>([
  'all',
  'screenshot',
  'recording',
  'export',
  'web-snapshot',
  'scenario',
]);

function getInitialFolderFilter(): FolderFilter {
  const folder = new URLSearchParams(window.location.search).get('folder');
  return GALLERY_FOLDERS.has(folder as FolderFilter) ? (folder as FolderFilter) : 'all';
}

function getInitialScope(): GalleryScope {
  return new URLSearchParams(window.location.search).get('scope') === 'temporary'
    ? 'temporary'
    : 'library';
}

export function useGalleryFilterState() {
  const [folderFilter, setFolderFilter] = useState<FolderFilter>(getInitialFolderFilter);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<GalleryScope>(getInitialScope);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionTagDraft, setSelectionTagDraft] = useState('');

  return {
    actions: {
      setActiveTags,
      setFolderFilter,
      setSearch,
      setScope,
      setSelectedIds,
      setSelectionTagDraft,
      setSortMode,
    },
    state: {
      activeTags,
      folderFilter,
      search,
      scope,
      selectedIds,
      selectionTagDraft,
      sortMode,
    },
  };
}
