import type { GalleryItemKind } from './items';
import type { FolderFilter, GalleryViewMode } from './types';

export const SIDEBAR_FOLDERS: FolderFilter[] = [
  'all',
  'screenshot',
  'recording',
  'export',
  'web-snapshot',
  'scenario',
];

export const FOLDER_FILTER_KIND_MAP: Record<
  Exclude<FolderFilter, 'all' | 'scenario'>,
  GalleryItemKind[]
> = {
  screenshot: ['screenshot', 'image'],
  recording: ['recording', 'video', 'video-project'],
  export: ['export', 'scenario-export'],
  'web-snapshot': ['web-archive'],
};

export const GRID_GAP = 18;
export const GRID_OVERSCAN_ROWS = 2;

export const GRID_CARD_MIN_WIDTH_BY_MODE: Record<Exclude<GalleryViewMode, 'list'>, number> = {
  'compact-grid': 220,
  'large-grid': 320,
};

export const GRID_ROW_HEIGHT_BY_MODE: Record<Exclude<GalleryViewMode, 'list'>, number> = {
  'compact-grid': 284,
  'large-grid': 360,
};
