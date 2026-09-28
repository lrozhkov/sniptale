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

const GRID_CARD_DETAILS_HEIGHT_BY_MODE: Record<Exclude<GalleryViewMode, 'list'>, number> = {
  'compact-grid': 144,
  'large-grid': 144,
};

export function getGalleryGridCardLayout(args: {
  columnCount: number;
  gridWidth: number;
  viewMode: Exclude<GalleryViewMode, 'list'>;
}) {
  const cardWidth = Math.max(
    0,
    (args.gridWidth - GRID_GAP * Math.max(0, args.columnCount - 1)) / args.columnCount
  );
  const cardHeight = Math.ceil(
    cardWidth * (9 / 16) + GRID_CARD_DETAILS_HEIGHT_BY_MODE[args.viewMode]
  );
  return { cardHeight, cardWidth, rowHeight: cardHeight + GRID_GAP };
}
