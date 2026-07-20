import { translate } from '../../../../platform/i18n';
import { DEFAULT_VIDEO_PROJECT_BACKGROUND, createVideoProjectSource } from '../defaults';
import { getVideoProjectMutationTimestamp } from '../mutation';
import { createDefaultVideoProjectUtilityLanes } from '../utility-lanes';
import { syncProjectSceneBackground } from '../scene/background';
import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
  createVideoProjectTransform,
} from './clip';
import { createVideoProjectAsset, createVideoProjectTrack, getDefaultTrackName } from './creation';
import {
  VideoMediaFitMode,
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoTimelinePlacementMode,
  VideoTrackKind,
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectTrack,
} from '../types/index';

export type MultiSourceRecordingProjectAssetInput = {
  recordingId: string;
  filename: string;
  width: number;
  height: number;
  duration: number;
  mimeType: string;
  size: number;
};

export type MultiSourceAudioProjectAssetInput = {
  recordingId: string;
  filename: string;
  duration: number;
  mimeType: string;
  size: number;
};

type MultiSourceWebcamProjectAssetInput = MultiSourceRecordingProjectAssetInput;

function createSceneBackgroundFields() {
  return syncProjectSceneBackground(
    { backgroundColor: DEFAULT_VIDEO_PROJECT_BACKGROUND },
    { kind: 'solid', color: DEFAULT_VIDEO_PROJECT_BACKGROUND }
  );
}

function createVideoAsset(input: MultiSourceRecordingProjectAssetInput) {
  return createVideoProjectAsset(
    input.filename,
    VideoProjectAssetType.RECORDING,
    { kind: 'recording', recordingId: input.recordingId },
    {
      width: input.width,
      height: input.height,
      duration: input.duration,
      mimeType: input.mimeType,
      size: input.size,
      hasAudio: false,
      audioPeaks: null,
    }
  );
}

function createAudioAsset(input: MultiSourceAudioProjectAssetInput) {
  return createVideoProjectAsset(
    input.filename,
    VideoProjectAssetType.AUDIO,
    { kind: 'recording', recordingId: input.recordingId },
    {
      width: 0,
      height: 0,
      duration: input.duration,
      mimeType: input.mimeType,
      size: input.size,
      hasAudio: true,
      audioPeaks: null,
    }
  );
}

function createVideoTracks(count: number): VideoProjectTrack[] {
  return Array.from({ length: count }, (_item, index) =>
    createVideoProjectTrack(
      getDefaultTrackName(VideoTrackKind.PRIMARY, index + 1),
      index + 1,
      VideoTrackKind.PRIMARY,
      index === 0
    )
  );
}

function createOverlayTrack(): VideoProjectTrack {
  return createVideoProjectTrack(
    getDefaultTrackName(VideoTrackKind.OVERLAY, 1),
    0,
    VideoTrackKind.OVERLAY,
    true
  );
}

function createAudioTrack(order: number): VideoProjectTrack {
  return createVideoProjectTrack(
    getDefaultTrackName(VideoTrackKind.AUDIO, 1),
    order,
    VideoTrackKind.AUDIO,
    true
  );
}

function createVideoClips(params: {
  projectHeight: number;
  projectWidth: number;
  tracks: VideoProjectTrack[];
  videos: ReturnType<typeof createVideoAsset>[];
}): VideoProjectClip[] {
  return params.videos.map((asset, index) => {
    const clip = createVideoClipFromAsset(
      params.tracks[index]?.id ?? params.tracks[0]?.id ?? '',
      asset,
      params.projectWidth,
      params.projectHeight,
      0,
      { muted: true }
    );
    if (clip.type !== VideoProjectClipType.VIDEO) {
      return clip;
    }

    return {
      ...clip,
      fitMode: VideoMediaFitMode.SOURCE_100,
      transform: createVideoProjectTransform(asset.metadata.width, asset.metadata.height),
    };
  });
}

export function createVideoProjectFromMultiSourceRecording(options: {
  name: string;
  videos: MultiSourceRecordingProjectAssetInput[];
  webcamVideo?: MultiSourceWebcamProjectAssetInput | null;
  microphoneAudio?: MultiSourceAudioProjectAssetInput | null;
}): VideoProject {
  const firstVideo = options.videos[0];
  const videos = options.webcamVideo ? [...options.videos, options.webcamVideo] : options.videos;
  const projectWidth = firstVideo?.width ?? 1920;
  const projectHeight = firstVideo?.height ?? 1080;
  const videoTracks = createVideoTracks(videos.length);
  const audioTrack = createAudioTrack(videoTracks.length + 1);
  const videoAssets = videos.map(createVideoAsset);
  const audioAsset = options.microphoneAudio ? createAudioAsset(options.microphoneAudio) : null;
  const clips = createVideoClips({
    projectHeight,
    projectWidth,
    tracks: videoTracks,
    videos: videoAssets,
  });
  if (audioAsset) {
    clips.push(createAudioClipFromAsset(audioTrack.id, audioAsset, 0));
  }
  const now = getVideoProjectMutationTimestamp();
  return {
    version: 2,
    id: crypto.randomUUID(),
    name: options.name || translate('shared.videoProject.defaultProjectName'),
    source: createVideoProjectSource(firstVideo?.recordingId ?? null),
    baseRecordingId: firstVideo?.recordingId ?? null,
    width: projectWidth,
    height: projectHeight,
    fps: 30,
    ...createSceneBackgroundFields(),
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: Math.max(0.1, ...clips.map((clip) => clip.duration)),
    createdAt: now,
    updatedAt: now,
    assets: audioAsset ? [...videoAssets, audioAsset] : videoAssets,
    tracks: [createOverlayTrack(), ...videoTracks, audioTrack],
    clips,
    transitions: [],
    utilityLanes: createDefaultVideoProjectUtilityLanes(),
    motionRegions: [],
    cursorTrack: null,
    actionEvents: [],
  };
}
