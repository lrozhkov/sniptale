export const GALLERY_SAVED_VIEWS_STORAGE_KEY = 'sniptale_gallery_saved_views';
export const MAX_GALLERY_SAVED_VIEWS = 50;
export const MAX_GALLERY_SAVED_VIEW_NAME_LENGTH = 80;

export type GallerySavedViewFolder =
  | 'all'
  | 'recording'
  | 'scenario'
  | 'screenshot'
  | 'web-snapshot';
export type GallerySavedViewScope = 'all' | 'library' | 'temporary';
export type GallerySavedViewFacetId =
  | 'created'
  | 'duration'
  | 'format'
  | 'resolution'
  | 'size'
  | 'source'
  | 'updated';
export type GallerySavedViewFacetFilters = Record<GallerySavedViewFacetId, string[]>;
export type GallerySavedViewMoveDirection = 'down' | 'up';

export interface GallerySavedViewFilterSnapshot {
  activeTags: string[];
  facetFilters: GallerySavedViewFacetFilters;
  scope: GallerySavedViewScope;
}

export interface GallerySavedView {
  createdAt: number;
  filters: GallerySavedViewFilterSnapshot;
  folderFilter: GallerySavedViewFolder;
  id: string;
  name: string;
  updatedAt: number;
}

export class GallerySavedViewError extends Error {
  constructor(
    readonly code: 'conflict' | 'invalid' | 'limit' | 'not-found',
    message: string
  ) {
    super(message);
    this.name = 'GallerySavedViewError';
  }
}
