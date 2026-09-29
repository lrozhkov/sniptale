import type { GalleryItemKind } from './items';
import type { FolderFilter, GalleryViewMode } from './types';

export const SIDEBAR_FOLDERS: FolderFilter[] = [
  'all',
  'video-project',
  'scenario',
  'screenshot',
  'recording',
  'audio',
  'web-snapshot',
  'export',
];

export const FOLDER_FILTER_KIND_MAP: Record<
  Exclude<FolderFilter, 'all' | 'scenario'>,
  GalleryItemKind[]
> = {
  audio: ['audio'],
  screenshot: ['screenshot', 'image'],
  recording: ['recording', 'video', 'export'],
  'video-project': ['video-project'],
  export: ['scenario-export'],
  'web-snapshot': ['web-archive'],
};

export const GRID_GAP = 18;
export const GRID_OVERSCAN_ROWS = 2;

export const GRID_CARD_MIN_WIDTH_BY_MODE: Record<Exclude<GalleryViewMode, 'list'>, number> = {
  'compact-grid': 220,
  'large-grid': 320,
};
