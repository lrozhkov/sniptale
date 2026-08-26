import type { Dispatch, SetStateAction } from 'react';
import type {
  FolderFilter,
  GalleryFacetDefinition,
  GalleryFacetFilterId,
  GalleryFacetFilters,
  GalleryFolderCounts,
  GalleryScope,
} from '../types';
import type { GallerySavedView } from '../../../composition/persistence/gallery-saved-views';

export interface GallerySidebarProps {
  activeSavedView?: GallerySavedView | null;
  activeTags: string[];
  allTags: string[];
  counts: GalleryFolderCounts;
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
