import type {
  MediaHubBackupDataClassFlags,
  MediaHubBackupExportOptions,
  MediaHubBackupSelectedScope,
} from '../contracts/types';

interface MediaHubBackupDataClassContent {
  editorDraftCount?: number;
  mediaAssetCount?: number;
  recordingCount?: number;
  scenarioProjectCount?: number;
  sourceMetadataCount?: number;
  telemetryCount?: number;
  thumbnailCount?: number;
  videoProjectCount?: number;
  webSnapshotCount?: number;
}

export const FULL_MEDIA_HUB_BACKUP_EXPORT_OPTIONS: MediaHubBackupExportOptions = {
  scope: 'all',
  includeEditorDrafts: true,
  includeSourceMetadata: true,
  includeTelemetry: true,
  includeWebSnapshots: true,
};

export const SUPPORT_MEDIA_HUB_BACKUP_EXPORT_OPTIONS: MediaHubBackupExportOptions = {
  scope: 'all',
  includeEditorDrafts: false,
  includeSourceMetadata: false,
  includeTelemetry: false,
  includeWebSnapshots: false,
};

export function createMediaHubBackupExportOptions(
  options: Partial<MediaHubBackupExportOptions> = {}
): MediaHubBackupExportOptions {
  const normalizedSelected =
    options.selected === undefined ? undefined : normalizeSelectedScope(options.selected);

  return {
    ...FULL_MEDIA_HUB_BACKUP_EXPORT_OPTIONS,
    ...options,
    ...(normalizedSelected === undefined ? {} : { selected: normalizedSelected }),
  };
}

export function createMediaHubBackupDataClassFlags(
  options: MediaHubBackupExportOptions,
  content: MediaHubBackupDataClassContent = {}
): MediaHubBackupDataClassFlags {
  return {
    editorDrafts: options.includeEditorDrafts && hasContent(content.editorDraftCount),
    mediaAssets: hasContent(content.mediaAssetCount),
    recordings: hasContent(content.recordingCount),
    scenarioProjects: hasContent(content.scenarioProjectCount),
    sourceMetadata: options.includeSourceMetadata && hasContent(content.sourceMetadataCount),
    telemetry: options.includeTelemetry && hasContent(content.telemetryCount),
    thumbnails: hasContent(content.thumbnailCount),
    videoProjects: hasContent(content.videoProjectCount),
    webSnapshots: options.includeWebSnapshots && hasContent(content.webSnapshotCount),
  };
}

function hasContent(value: number | undefined): boolean {
  return value === undefined ? true : value > 0;
}

function normalizeSelectedScope(
  selected: MediaHubBackupSelectedScope
): MediaHubBackupSelectedScope {
  return {
    mediaAssetIds: Array.from(new Set(selected.mediaAssetIds)),
    scenarioProjectIds: Array.from(new Set(selected.scenarioProjectIds)),
    videoProjectIds: Array.from(new Set(selected.videoProjectIds)),
  };
}
