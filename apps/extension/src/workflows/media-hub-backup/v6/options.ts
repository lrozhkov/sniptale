import type { MediaHubBackupExportOptions, MediaHubBackupSelectedScope } from './contracts';

export const FULL_MEDIA_HUB_BACKUP_EXPORT_OPTIONS: MediaHubBackupExportOptions = {
  includeSourceMetadata: true,
  includeTelemetry: true,
  includeWebSnapshots: true,
  scope: 'all',
};

export const SUPPORT_MEDIA_HUB_BACKUP_EXPORT_OPTIONS: MediaHubBackupExportOptions = {
  includeSourceMetadata: false,
  includeTelemetry: false,
  includeWebSnapshots: false,
  scope: 'all',
};

function normalizeSelectedScope(
  selected: MediaHubBackupSelectedScope
): MediaHubBackupSelectedScope {
  return {
    mediaAssetIds: [...new Set(selected.mediaAssetIds)],
    scenarioProjectIds: [...new Set(selected.scenarioProjectIds)],
    videoProjectIds: [...new Set(selected.videoProjectIds)],
  };
}

export function createMediaHubBackupExportOptions(
  options: Partial<MediaHubBackupExportOptions> = {}
): MediaHubBackupExportOptions {
  return {
    includeSourceMetadata:
      options.includeSourceMetadata ?? FULL_MEDIA_HUB_BACKUP_EXPORT_OPTIONS.includeSourceMetadata,
    includeTelemetry:
      options.includeTelemetry ?? FULL_MEDIA_HUB_BACKUP_EXPORT_OPTIONS.includeTelemetry,
    includeWebSnapshots:
      options.includeWebSnapshots ?? FULL_MEDIA_HUB_BACKUP_EXPORT_OPTIONS.includeWebSnapshots,
    scope: options.scope ?? FULL_MEDIA_HUB_BACKUP_EXPORT_OPTIONS.scope,
    ...(options.selected ? { selected: normalizeSelectedScope(options.selected) } : {}),
  };
}
