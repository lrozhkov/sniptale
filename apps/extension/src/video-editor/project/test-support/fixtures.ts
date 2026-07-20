import {
  VideoProjectSourceKind,
  VideoTimelinePlacementMode,
  type VideoProject,
} from '../../../features/video/project/types';
import type { ProjectAssetEntry } from '../../../composition/persistence/projects/contracts';

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

export function createProjectAssetEntry(
  overrides: Partial<ProjectAssetEntry> = {}
): ProjectAssetEntry {
  return {
    blob: new Blob(['asset'], { type: 'image/png' }),
    createdAt: 200,
    id: 'asset-1',
    mimeType: 'image/png',
    size: 12,
    ...overrides,
  };
}
