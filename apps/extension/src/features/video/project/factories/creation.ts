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
import { VideoTimelinePlacementMode, VideoTrackKind } from '../types/index';

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
  if (kind === VideoTrackKind.SUBTITLE) {
    return index === 1
      ? translate('shared.videoProject.trackSubtitles')
      : `${translate('shared.videoProject.trackSubtitlesPrefix')} ${index}`;
  }
  return index === 1
    ? translate('shared.videoProject.trackOverlays')
    : `${translate('shared.videoProject.trackOverlaysPrefix')} ${index}`;
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
  const { audioTrack, overlayTrack, primaryTrack } = createDefaultProjectTracks();
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
    tracks: [primaryTrack, audioTrack, overlayTrack],
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

function createDefaultProjectTracks(): {
  audioTrack: VideoProjectTrack;
  overlayTrack: VideoProjectTrack;
  primaryTrack: VideoProjectTrack;
} {
  return {
    overlayTrack: createVideoProjectTrack(
      getDefaultTrackName(VideoTrackKind.OVERLAY, 1),
      0,
      VideoTrackKind.OVERLAY,
      true
    ),
    primaryTrack: createVideoProjectTrack(
      getDefaultTrackName(VideoTrackKind.PRIMARY, 1),
      1,
      VideoTrackKind.PRIMARY,
      true
    ),
    audioTrack: createVideoProjectTrack(
      getDefaultTrackName(VideoTrackKind.AUDIO, 1),
      2,
      VideoTrackKind.AUDIO,
      true
    ),
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
