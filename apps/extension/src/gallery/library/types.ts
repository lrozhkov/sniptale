import type {
  LibraryFacetId,
  LibraryFacetFilters,
  LibraryFilterScope,
} from '../../features/media-hub/library-filters';
import type { GalleryItem } from './items';

export type FolderFilter =
  | 'all'
  | 'screenshot'
  | 'recording'
  | 'export'
  | 'web-snapshot'
  | 'scenario';

export type GalleryFolderCounts = Record<Exclude<FolderFilter, 'web-snapshot'>, number> & {
  'web-snapshot'?: number;
};

export type SortMode = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc';
export type GalleryScope = LibraryFilterScope;
export type GalleryViewMode = 'list' | 'compact-grid' | 'large-grid';

export type GalleryFacetFilterId = LibraryFacetId;

export type GalleryFacetId = 'status' | 'tags' | GalleryFacetFilterId;

export type GalleryFacetFilters = LibraryFacetFilters;

interface GalleryFacetOption {
  count: number;
  label: string;
  value: string;
}

export interface GalleryFacetDefinition {
  id: GalleryFacetId;
  options: GalleryFacetOption[];
  searchable: boolean;
}

export interface GalleryGridMetrics {
  columnCount: number;
  startRow: number;
  totalRows: number;
}

export interface GalleryPreviewSessionState {
  initialMode?: 'edit';
  inspectorCollapsed: boolean;
  item: GalleryItem | null;
  url: string | null;
}
