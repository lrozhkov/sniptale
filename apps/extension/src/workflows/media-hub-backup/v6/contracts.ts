import type {
  ArchiveObjectRef,
  ArchiveRootDescriptor,
} from '../../../composition/archive-transfer';
import type { MEDIA_HUB_BACKUP_LAYOUT } from './layout';
import type { GallerySavedView } from '../../../composition/persistence/gallery-saved-views';

export const MEDIA_HUB_BACKUP_FORMAT = 'sniptale-media-hub-backup';
export const MEDIA_HUB_BACKUP_VERSION = 6;
export const MAX_CATALOG_SHARD_BYTES = 4 * 1024 * 1024;
export const MAX_CATALOG_SHARD_ROOTS = 1_000;
export const MAX_ROOT_METADATA_BYTES = 4 * 1024 * 1024;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface MediaHubBackupPrivacyFlags {
  includeSourceMetadata: boolean;
  includeTelemetry: boolean;
  includeWebSnapshots: boolean;
}

export interface MediaHubBackupDataClassFlags {
  drafts: boolean;
  mediaAssets: boolean;
  recordings: boolean;
  savedViews: boolean;
  scenarioProjects: boolean;
  sourceMetadata: boolean;
  telemetry: boolean;
  thumbnails: boolean;
  videoProjects: boolean;
  webSnapshots: boolean;
}

export interface MediaHubLocalBackupSummary {
  approximateSizeBytes: number;
  assetCount: number;
  draftCount: number;
  dataClasses: MediaHubBackupDataClassFlags;
  recordingCount: number;
  savedViewCount: number;
  scenarioProjectCount: number;
  selectedCount: number;
  sourceMetadataCount: number;
  thumbnailCount: number;
  videoProjectCount: number;
  webSnapshotCount: number;
}

export interface MediaHubBackupSelectedScope {
  mediaAssetIds: string[];
  scenarioProjectIds: string[];
  videoProjectIds: string[];
}

export interface MediaHubBackupExportOptions extends MediaHubBackupPrivacyFlags {
  includeDrafts: boolean;
  scope: 'all' | 'selected';
  selected?: MediaHubBackupSelectedScope;
}

export interface MediaHubBackupCatalogShard {
  path: string;
  rootKind: ArchiveRootDescriptor['rootKind'];
  mediaSubtype?: 'library-item' | 'effect-bundle';
  rootCount: number;
  objectCount: number;
  totalBytes: number;
}

export interface MediaHubBackupManifestV6 {
  archiveId: string;
  catalogs: MediaHubBackupCatalogShard[];
  exportedAt: string;
  format: typeof MEDIA_HUB_BACKUP_FORMAT;
  galleryViews?: GallerySavedView[];
  layout: typeof MEDIA_HUB_BACKUP_LAYOUT;
  privacy: MediaHubBackupPrivacyFlags;
  totals: {
    bytes: number;
    objects: number;
    roots: number;
    rootsByProfile: {
      effectBundles: number;
      libraryItems: number;
      scenarioProjects: number;
      videoProjects: number;
    };
  };
  version: typeof MEDIA_HUB_BACKUP_VERSION;
}

export interface MediaHubBackupRootEnvelope {
  descriptor: ArchiveRootDescriptor;
  metadata: JsonValue;
  objects: ArchiveObjectRef[];
}

export interface ArchiveCentralDirectoryIdentity {
  compressedSize: number;
  crc32: number;
  path: string;
  size: number;
}
