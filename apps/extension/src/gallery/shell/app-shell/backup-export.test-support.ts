import type { MediaHubLocalBackupSummary } from '../../../workflows/media-hub-backup';

export function createLocalBackupSummary(): MediaHubLocalBackupSummary {
  return {
    approximateSizeBytes: 0,
    assetCount: 0,
    dataClasses: {
      editorDrafts: false,
      mediaAssets: false,
      recordings: false,
      scenarioProjects: false,
      sourceMetadata: false,
      telemetry: false,
      thumbnails: false,
      videoProjects: false,
      webSnapshots: false,
    },
    editorDraftCount: 0,
    recordingCount: 0,
    scenarioProjectCount: 0,
    selectedCount: 0,
    sourceMetadataCount: 0,
    thumbnailCount: 0,
    videoProjectCount: 0,
    webSnapshotCount: 0,
  };
}
