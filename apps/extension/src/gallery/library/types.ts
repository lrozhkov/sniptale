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

export type SortMode = 'newest' | 'oldest' | 'size';
export type GalleryViewMode = 'list' | 'compact-grid' | 'large-grid';

export interface GalleryGridMetrics {
  columnCount: number;
  startRow: number;
  totalRows: number;
}

export interface GalleryPreviewSessionState {
  inspectorCollapsed: boolean;
  item: GalleryItem | null;
  url: string | null;
}
