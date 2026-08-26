import type { Dispatch, SetStateAction } from 'react';
import type {
  FolderFilter,
  GalleryFacetDefinition,
  GalleryFacetFilterId,
  GalleryFacetFilters,
  GalleryFolderCounts,
  GalleryScope,
} from '../types';

export interface GallerySidebarProps {
  activeTags: string[];
  allTags: string[];
  counts: GalleryFolderCounts;
  facetFilters: GalleryFacetFilters;
  facets: GalleryFacetDefinition[];
  folderFilter: FolderFilter;
  scope: GalleryScope;
  onActiveTagsChange: Dispatch<SetStateAction<string[]>>;
  onFolderFilterChange: Dispatch<SetStateAction<FolderFilter>>;
  onFacetFilterChange: (id: GalleryFacetFilterId, values: string[]) => void;
  onResetFilters: () => void;
  onScopeChange: Dispatch<SetStateAction<GalleryScope>>;
}
