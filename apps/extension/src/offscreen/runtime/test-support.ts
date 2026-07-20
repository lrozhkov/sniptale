import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
} from '../../features/video/project/types';
import type { VideoProject, VideoProjectExportSettings } from '../../features/video/project/types';

export function createProject(): VideoProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 10,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
    cursorTrack: null,
    actionEvents: [],
  };
}

export function createExportSettings(): VideoProjectExportSettings {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
  };
}

export function createProjectExportInputReference(jobId = 'job-1') {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId,
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}
