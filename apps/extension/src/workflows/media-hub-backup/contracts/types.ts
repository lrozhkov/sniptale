import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
} from '../../../composition/persistence/media-library/contracts';
import type {
  ProjectAssetEntry,
  ProjectExportEntry,
  VideoProjectEntry,
} from '../../../composition/persistence/projects/contracts';
import type {
  RecordingEntry,
  RecordingTelemetryEntry,
} from '../../../composition/persistence/recordings/contracts';
import type {
  ScenarioAssetEntry,
  ScenarioExportEntry,
  ScenarioProjectEntry,
  ScenarioStepEditorDocumentEntry,
} from '../../../composition/persistence/scenario/contracts';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
  VideoProjectEffectSnapshotAsset,
} from '../../../features/video/project/effect-instance/types';
import type {
  EffectBundleCatalogAssetEntry,
  EffectBundleCatalogEntry,
} from '../../../features/video/project/effect-bundle/catalog';

export type MediaHubImportConflictStrategy = 'replace' | 'skip' | 'duplicate';

export interface MediaHubBackupSelectedScope {
  mediaAssetIds: string[];
  scenarioProjectIds: string[];
  videoProjectIds: string[];
}

export interface MediaHubBackupExportOptions {
  scope: 'all' | 'selected';
  selected?: MediaHubBackupSelectedScope;
  includeTelemetry: boolean;
  includeSourceMetadata: boolean;
  includeWebSnapshots: boolean;
  includeEditorDrafts: boolean;
}

export interface MediaHubBackupDataClassFlags {
  editorDrafts: boolean;
  mediaAssets: boolean;
  recordings: boolean;
  scenarioProjects: boolean;
  sourceMetadata: boolean;
  telemetry: boolean;
  thumbnails: boolean;
  videoProjects: boolean;
  webSnapshots: boolean;
}

export interface MediaHubBackupManifest {
  format: string;
  version: number;
  exportedAt: string;
  assetCount: number;
  effectBundleCount: number;
  thumbnailCount: number;
  scenarioProjectCount?: number;
  videoProjectCount?: number;
  dataClasses?: MediaHubBackupDataClassFlags;
  privacyOptions?: MediaHubBackupExportOptions;
}

export interface MediaHubBackupAssetDescriptor {
  entry: Omit<MediaLibraryEntry, 'blob'>;
  assetPath: string | null;
  recordingTelemetry?: RecordingTelemetryEntry;
  thumbnailPath: string | null;
}

export interface MediaHubBackupMetadata {
  assets: MediaHubBackupAssetDescriptor[];
  effectBundles: EffectBundleBackupDescriptor[];
  scenarioProjects?: ScenarioBackupProjectDescriptor[];
  videoProjects?: VideoBackupProjectDescriptor[];
}

export interface EffectBundleBackupAssetDescriptor {
  blobPath: string;
  entry: Omit<EffectBundleCatalogAssetEntry, 'blob'>;
}

export interface EffectBundleBackupDescriptor {
  assets: EffectBundleBackupAssetDescriptor[];
  entry: Omit<EffectBundleCatalogEntry, 'assets'>;
}

export interface BackupBlobDescriptor {
  blobPath: string;
  entry: Omit<
    ProjectAssetEntry | RecordingEntry | ScenarioAssetEntry | MediaThumbnailEntry,
    'blob'
  >;
}

export interface ProjectAssetBackupBlobDescriptor {
  blobPath: string;
  entry: Omit<ProjectAssetEntry, 'blob'>;
}

export interface EffectSnapshotBackupBlobDescriptor {
  blobPath: string;
  entry: Omit<VideoProjectEffectSnapshotAsset, 'blob'>;
}

export interface EffectSnapshotBackupDescriptor extends Omit<VideoProjectEffectSnapshot, 'assets'> {
  assets: EffectSnapshotBackupBlobDescriptor[];
}

export interface EffectProjectBackupDescriptor {
  instances: VideoProjectEffectInstance[];
  snapshots: EffectSnapshotBackupDescriptor[];
}

export interface VideoBackupProjectDescriptor {
  entry: VideoProjectEntry;
  effectProject?: EffectProjectBackupDescriptor;
  projectAssets: ProjectAssetBackupBlobDescriptor[];
  projectExports: Array<{
    entry: ProjectExportEntry;
    recording: BackupBlobDescriptor;
    recordingTelemetry?: RecordingTelemetryEntry;
    thumbnail?: BackupBlobDescriptor;
  }>;
  thumbnail?: BackupBlobDescriptor;
}

export interface ScenarioBackupProjectDescriptor {
  assets: BackupBlobDescriptor[];
  entry: ScenarioProjectEntry;
  exports: ScenarioExportEntry[];
  stepDocuments: ScenarioStepEditorDocumentEntry[];
  thumbnail?: BackupBlobDescriptor;
  exportThumbnails?: BackupBlobDescriptor[];
}

export interface MediaHubBackupSummary {
  manifest: MediaHubBackupManifest;
  assetCount: number;
  thumbnailCount: number;
  conflicts: string[];
}

export interface MediaHubLocalBackupSummary {
  approximateSizeBytes: number;
  assetCount: number;
  dataClasses: MediaHubBackupDataClassFlags;
  editorDraftCount: number;
  recordingCount: number;
  scenarioProjectCount: number;
  selectedCount: number;
  sourceMetadataCount: number;
  thumbnailCount: number;
  videoProjectCount: number;
  webSnapshotCount: number;
}

export interface MediaHubImportResult {
  imported: number;
  skipped: number;
  conflictsResolved: number;
}
