import { translate } from '../../../../platform/i18n';
import {
  createVideoProjectSource,
  DEFAULT_VIDEO_PROJECT_BACKGROUND,
  DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE,
} from '../defaults';
import { getVideoProjectMutationTimestamp } from '../mutation';
import { createVideoProjectLogicalLane } from '../timeline/logical-lanes';
import {
  createRecordingVideoProject,
  type CreateVideoProjectFromRecordingOptions,
} from './project-recording-factory';
import { syncProjectSceneBackground } from '../scene/background';
import { createDefaultVideoProjectUtilityLanes } from '../utility-lanes';
import type {
  VideoProjectAssetType,
  VideoProject,
  VideoProjectAsset,
  VideoProjectAssetMetadata,
  VideoProjectAssetSource,
  VideoProjectTrack,
} from '../types/index';
import { VideoTimelinePlacementMode, VideoTrackKind, VideoProjectTrackRole } from '../types/index';

export function createClipGroupId(): string {
  return crypto.randomUUID();
}

export function getDefaultTrackName(kind: VideoTrackKind, index = 1): string {
  if (kind === VideoTrackKind.PRIMARY) {
    return `${translate('shared.videoProject.trackVideoPrefix')} ${index}`;
  }
  if (kind === VideoTrackKind.AUDIO) {
    return `${translate('shared.videoProject.trackAudioPrefix')} ${index}`;
  }
  return index === 1
    ? translate('shared.videoProject.trackSubtitles')
    : `${translate('shared.videoProject.trackSubtitlesPrefix')} ${index}`;
}

export function createVideoProjectTrack(
  name: string,
  order: number,
  kind: VideoTrackKind,
  isRoot = false
): VideoProjectTrack {
  return {
    id: crypto.randomUUID(),
    name,
    order,
    isRoot,
    logicalLanes: [createVideoProjectLogicalLane(0)],
    visible: true,
    locked: false,
    kind,
    ...(kind === VideoTrackKind.SUBTITLE
      ? { subtitleStyle: { ...DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE } }
      : {}),
  };
}

/** Resolves a free ordinary video layer above visible content for an overlay interval. */
export function resolveVideoOverlayTrack(
  project: VideoProject,
  startTime: number,
  duration: number,
  preferredTrackId?: string | null
): VideoProjectTrack {
  const occupied = new Set(
    project.clips
      .filter(
        (clip) =>
          clip.startTime < startTime + duration && startTime < clip.startTime + clip.duration
      )
      .map((clip) => clip.trackId)
  );
  const highestContentOrder = Math.min(
    Infinity,
    ...project.tracks
      .filter(
        (track) => track.kind !== VideoTrackKind.AUDIO && track.visible && occupied.has(track.id)
      )
      .map((track) => track.order)
  );
  const available = project.tracks.filter(
    (track) =>
      track.kind === VideoTrackKind.PRIMARY &&
      track.role !== VideoProjectTrackRole.CAMERA &&
      track.visible &&
      !track.locked &&
      !occupied.has(track.id) &&
      track.order < highestContentOrder
  );
  const existing =
    available.find((track) => track.id === preferredTrackId) ??
    available.find((track) => !track.isRoot);
  return (
    existing ??
    createVideoProjectTrack(
      getDefaultTrackName(
        VideoTrackKind.PRIMARY,
        project.tracks.filter((track) => track.kind === VideoTrackKind.PRIMARY).length + 1
      ),
      Math.min(0, ...project.tracks.map((track) => track.order)) - 1,
      VideoTrackKind.PRIMARY
    )
  );
}

export function createVideoProjectAsset(
  name: string,
  type: VideoProjectAssetType,
  source: VideoProjectAssetSource,
  metadata: VideoProjectAssetMetadata
): VideoProjectAsset {
  return {
    id: crypto.randomUUID(),
    type,
    name,
    source,
    metadata,
    createdAt: getVideoProjectMutationTimestamp(),
  };
}

export function createEmptyVideoProject(
  name = translate('shared.videoProject.defaultProjectName'),
  width = 1920,
  height = 1080
): VideoProject {
  const primaryTrack = createVideoProjectTrack(
    getDefaultTrackName(VideoTrackKind.PRIMARY, 1),
    1,
    VideoTrackKind.PRIMARY,
    true
  );
  const now = getVideoProjectMutationTimestamp();

  return {
    version: 2,
    id: crypto.randomUUID(),
    name,
    source: createVideoProjectSource(null),
    baseRecordingId: null,
    width,
    height,
    fps: 30,
    ...createDefaultSceneBackgroundFields(),
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    duration: 0,
    createdAt: now,
    updatedAt: now,
    assets: [],
    tracks: [primaryTrack],
    clips: [],
    transitions: [],
    effectInstances: [],
    effectSnapshots: [],
    objectTracks: [],
    utilityLanes: createDefaultVideoProjectUtilityLanes(),
    motionRegions: [],
    cursorTrack: null,
    actionEvents: [],
  };
}

function createDefaultSceneBackgroundFields() {
  return syncProjectSceneBackground(
    {
      backgroundColor: DEFAULT_VIDEO_PROJECT_BACKGROUND,
    },
    {
      kind: 'solid',
      color: DEFAULT_VIDEO_PROJECT_BACKGROUND,
    }
  );
}

export function createVideoProjectFromRecording(
  options: CreateVideoProjectFromRecordingOptions
): VideoProject {
  return createRecordingVideoProject(options, {
    createClipGroupId,
    createVideoProjectTrack,
    getDefaultTrackName,
  });
}
