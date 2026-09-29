import type { Dispatch, SetStateAction } from 'react';
import type {
  FolderFilter,
  GalleryFacetDefinition,
  GalleryFacetFilterId,
  GalleryFacetFilters,
  GalleryFolderCounts,
  GalleryScope,
  GalleryTrashSummary,
} from '../types';
import type { GallerySavedView } from '../../../composition/persistence/gallery-saved-views';
import type { LocalStoragePolicy } from '../../../contracts/settings';

export interface GalleryTrashRetentionProps {
  status: 'loading' | 'ready' | 'unavailable';
  policy: Pick<LocalStoragePolicy, 'trashCleanupEnabled' | 'trashRetentionDays'> | null;
  saving: boolean;
  feedback: 'saved' | 'error' | null;
  onChange(patch: { trashCleanupEnabled?: boolean; trashRetentionDays?: number }): void;
  onRetry(): void;
}

export interface GallerySidebarProps {
  trashSummary?: GalleryTrashSummary;
  trashMode?: boolean;
  busy?: boolean;
  selectedCount?: number;
  onTrashModeChange?: (value: boolean) => void;
  onRestoreTrash?: () => void;
  onDeleteTrash?: () => void;
  onEmptyTrash?: () => void;
  activeSavedView?: GallerySavedView | null;
  activeTags: string[];
  allTags: string[];
  counts: GalleryFolderCounts;
  countsKnown: boolean;
  countsLoading?: boolean;
  facetFilters: GalleryFacetFilters;
  facets: GalleryFacetDefinition[];
  filteredItemCount: number;
  folderFilter: FolderFilter;
  isSavedViewDirty?: boolean;
  savedViews?: GallerySavedView[];
  savedViewsLoadFailed?: boolean;
  savedViewsLoaded?: boolean;
  scope: GalleryScope;
  onActiveTagsChange: Dispatch<SetStateAction<string[]>>;
  onFolderFilterChange: Dispatch<SetStateAction<FolderFilter>>;
  onFacetFilterChange: (id: GalleryFacetFilterId, values: string[]) => void;
  onCreateSavedView?: (name: string) => Promise<GallerySavedView>;
  onDeleteSavedView?: (view: GallerySavedView) => void;
  onMoveSavedView?: (id: string, direction: 'down' | 'up') => void;
  onResetFilters: () => void;
  onSavedViewSelect?: (id: string) => void;
  onSelectAll: () => void;
  onScopeChange: Dispatch<SetStateAction<GalleryScope>>;
  onUpdateSavedView?: () => Promise<void>;
}
