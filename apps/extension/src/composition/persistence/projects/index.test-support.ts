import {
  VideoTimelinePlacementMode,
  VideoProjectSourceKind,
  VideoProjectAssetType,
  type VideoProject,
} from '../../../features/video/project/types/index';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import type { VideoProjectEntry } from './contracts';

export {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
} from './index.storage.test-support';

export function createVideoProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    actionEvents: [],
    assets: [],
    backgroundColor: '#000000',
    baseRecordingId: null,
    clips: [],
    createdAt: 100,
    cursorTrack: null,
    duration: 30,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Demo project',
    source: {
      kind: VideoProjectSourceKind.MANUAL,
    },
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    tracks: [],
    updatedAt: 100,
    version: 2,
    width: 1280,
    ...overrides,
  };
}

export function createVideoProjectEntry(
  projectOverrides: Partial<VideoProject> = {},
  overrides: Partial<VideoProjectEntry> = {}
): VideoProjectEntry {
  const project = createVideoProject(projectOverrides);
  return {
    createdAt: project.createdAt,
    id: project.id,
    project,
    updatedAt: project.updatedAt,
    ...overrides,
  };
}

export function createVideoProjectEntryWithMediaClip(
  projectOverrides: Partial<VideoProject> = {}
): VideoProjectEntry {
  const project = createEmptyVideoProject(
    projectOverrides.name ?? 'Newer',
    projectOverrides.width ?? 1920,
    projectOverrides.height ?? 1080
  );
  const asset = createVideoProjectAsset(
    'Clip asset',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    {
      audioPeaks: null,
      duration: 10,
      hasAudio: true,
      height: project.height,
      mimeType: 'video/webm',
      size: 1024,
      width: project.width,
    }
  );
  const clip = createVideoClipFromAsset(
    project.tracks[0]!.id,
    asset,
    project.width,
    project.height
  );

  return createVideoProjectEntry({
    ...project,
    ...projectOverrides,
    assets: [asset],
    clips: [clip],
    tracks: project.tracks.slice(0, 2),
  });
}
