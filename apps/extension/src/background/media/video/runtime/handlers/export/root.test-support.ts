import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../../../../features/video/project/types';

export function createExportHandlerProject(): VideoProject {
  return {
    actionEvents: [],
    assets: [],
    backgroundColor: '#000000',
    baseRecordingId: null,
    clips: [],
    createdAt: 1,
    cursorTrack: null,
    duration: 10,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    tracks: [],
    updatedAt: 1,
    version: 2,
    width: 1280,
  };
}

export function createExportHandlerInputReference(jobId: string) {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId,
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

export function createExportHandlerSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}
