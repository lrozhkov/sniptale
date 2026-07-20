import type {
  MediaAssetKind,
  MediaAssetSource,
  MediaLibraryItem,
} from '../../../composition/persistence/media-library/contracts';
import type { VideoProjectListItem } from '../../../features/media-hub/video-project-list-items';
import type { ScenarioExportFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioProjectSummary } from '../../../features/scenario/contracts/types/project';
import type { ScenarioExportEntry } from '@sniptale/runtime-contracts/scenario/types/session';

export type GalleryItemKind = MediaAssetKind | 'scenario' | 'scenario-export' | 'video-project';

interface GalleryItemBase {
  createdAt: number;
  filename: string;
  hasThumbnail: boolean;
  id: string;
  kind: GalleryItemKind;
  originalFilename?: string;
  size: number;
  sourceFavicon: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  tags: string[];
  updatedAt: number;
}

export interface GalleryMediaItem extends GalleryItemBase {
  duration: number | null;
  entityId?: string;
  height: number | null;
  kind: MediaAssetKind;
  mimeType: string;
  type?: 'media';
  width: number | null;
  source: MediaAssetSource;
}

export interface GalleryScenarioItem extends GalleryItemBase {
  duration: null;
  entityId: string;
  height: null;
  kind: 'scenario';
  mimeType: 'application/x-sniptale-scenario';
  project: ScenarioProjectSummary;
  type: 'scenario';
  width: null;
}

export interface GalleryScenarioExportItem extends GalleryItemBase {
  duration: null;
  entityId: string;
  exportEntry: ScenarioExportEntry;
  format: ScenarioExportFormat;
  height: null;
  kind: 'scenario-export';
  mimeType: 'application/x-sniptale-scenario-export';
  project: ScenarioProjectSummary;
  type: 'scenario-export';
  width: null;
}

export interface GalleryVideoProjectItem extends GalleryItemBase {
  duration: number;
  entityId: string;
  height: number;
  kind: 'video-project';
  mimeType: 'application/x-sniptale-video-project';
  project: VideoProjectListItem;
  thumbnailSourceMediaId: string | null;
  type: 'video-project';
  unavailableReason: VideoProjectListItem['unavailableReason'] | null;
  width: number;
}

export type GalleryItem =
  | GalleryMediaItem
  | GalleryScenarioItem
  | GalleryScenarioExportItem
  | GalleryVideoProjectItem;

export function isGalleryMediaItem(item: GalleryItem): item is GalleryMediaItem {
  return item.type === 'media';
}

export function isGalleryScenarioItem(item: GalleryItem): item is GalleryScenarioItem {
  return item.type === 'scenario';
}

export function isGalleryScenarioExportItem(item: GalleryItem): item is GalleryScenarioExportItem {
  return item.type === 'scenario-export';
}

export function isGalleryVideoProjectItem(item: GalleryItem): item is GalleryVideoProjectItem {
  return item.type === 'video-project';
}

export function isGalleryVideoProjectAvailable(item: GalleryItem): boolean {
  return !isGalleryVideoProjectItem(item) || item.unavailableReason === null;
}

export function isGallerySelectableItem(
  item: GalleryItem
): item is GalleryMediaItem | GalleryScenarioItem | GalleryVideoProjectItem {
  return item.type === 'media' || item.type === 'scenario' || item.type === 'video-project';
}

export function createGalleryMediaItem(item: MediaLibraryItem): GalleryMediaItem {
  return {
    ...item,
    entityId: item.id,
    type: 'media',
  };
}
