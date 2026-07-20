import { useState } from 'react';
import type { FolderFilter, SortMode } from './types';

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

export function useGalleryFilterState() {
  const [folderFilter, setFolderFilter] = useState<FolderFilter>(getInitialFolderFilter);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionTagDraft, setSelectionTagDraft] = useState('');

  return {
    actions: {
      setActiveTags,
      setFolderFilter,
      setSearch,
      setSelectedIds,
      setSelectionTagDraft,
      setSortMode,
    },
    state: {
      activeTags,
      folderFilter,
      search,
      selectedIds,
      selectionTagDraft,
      sortMode,
    },
  };
}
