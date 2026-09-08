import { translate } from '../../../../platform/i18n';
import { DEFAULT_VIDEO_PROJECT_BACKGROUND, createVideoProjectSource } from '../defaults';
import { getVideoProjectMutationTimestamp } from '../mutation';
import { createDefaultVideoProjectUtilityLanes } from '../utility-lanes';
import { syncProjectSceneBackground } from '../scene/background';
import { createAudioClipFromAsset } from './clip';
import {
  createClipGroupId,
  createVideoProjectAsset,
  createVideoProjectTrack,
  getDefaultTrackName,
} from './creation';
import {
  VideoProjectAssetType,
  VideoProjectTrackRole,
  VideoTimelinePlacementMode,
  VideoTrackKind,
  type VideoProject,
  type VideoProjectAsset,
  type VideoProjectClip,
  type VideoProjectTrack,
} from '../types/index';
import { createRecordingSidecarClip } from './recording-sidecar';
import { resolveVideoProjectCameraTrackOrder } from '../camera/track-order';

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

function createVideoAsset(
  input: MultiSourceRecordingProjectAssetInput,
  recordingPart: NonNullable<VideoProjectAsset['recordingPart']>
): VideoProjectAsset {
  const asset = createVideoProjectAsset(
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
  return { ...asset, recordingPart };
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

function createVideoTracks(count: number, cameraTrackIndex: number | null): VideoProjectTrack[] {
  return Array.from({ length: count }, (_item, index) => {
    const track = createVideoProjectTrack(
      getDefaultTrackName(VideoTrackKind.PRIMARY, index + 1),
      index === cameraTrackIndex ? resolveVideoProjectCameraTrackOrder(0, 1) : index + 1,
      VideoTrackKind.PRIMARY,
      index === 0
    );
    return index === cameraTrackIndex ? { ...track, role: VideoProjectTrackRole.CAMERA } : track;
  });
}

function createAudioTrack(order: number): VideoProjectTrack {
  return createVideoProjectTrack(
    getDefaultTrackName(VideoTrackKind.AUDIO, 1),
    order,
    VideoTrackKind.AUDIO,
    false
  );
}

function createVideoClips(params: {
  projectHeight: number;
  projectWidth: number;
  tracks: VideoProjectTrack[];
  videos: ReturnType<typeof createVideoAsset>[];
  groupId: string | null;
  duration: number;
}): VideoProjectClip[] {
  return params.videos.map((asset, index) =>
    createRecordingSidecarClip({
      asset,
      projectHeight: params.projectHeight,
      projectWidth: params.projectWidth,
      trackId: params.tracks[index]?.id ?? params.tracks[0]?.id ?? '',
      ...(params.tracks[index]?.role ? { trackRole: params.tracks[index].role } : {}),
      groupId: params.groupId,
      duration: params.duration,
    })
  );
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
  const videoTracks = createVideoTracks(
    videos.length,
    options.webcamVideo ? options.videos.length : null
  );
  const audioTrack = createAudioTrack(videoTracks.length + 1);
  const recordingId = firstVideo?.recordingId ?? options.webcamVideo?.recordingId;
  const videoAssets = videos.map((input, index) =>
    createVideoAsset(input, {
      recordingId: recordingId ?? input.recordingId,
      role: index === options.videos.length ? 'camera' : index === 0 ? 'primary' : 'video',
    })
  );
  const audioAsset = options.microphoneAudio ? createAudioAsset(options.microphoneAudio) : null;
  if (audioAsset && recordingId) audioAsset.recordingPart = { recordingId, role: 'audio' };
  const groupId = videoAssets.length + Number(Boolean(audioAsset)) > 1 ? createClipGroupId() : null;
  const duration = Math.max(
    0.1,
    firstVideo?.duration ?? options.webcamVideo?.duration ?? audioAsset?.metadata.duration ?? 0.1
  );
  const clips = createVideoClips({
    groupId,
    duration,
    projectHeight,
    projectWidth,
    tracks: videoTracks,
    videos: videoAssets,
  });
  if (audioAsset) {
    const clip = createAudioClipFromAsset(audioTrack.id, audioAsset, 0, { groupId });
    const audioDuration = Math.min(duration, clip.duration);
    clips.push({ ...clip, duration: audioDuration, sourceDuration: audioDuration });
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
    tracks: audioAsset ? [...videoTracks, audioTrack] : videoTracks,
    clips,
    transitions: [],
    utilityLanes: createDefaultVideoProjectUtilityLanes(),
    motionRegions: [],
    cursorTrack: null,
    actionEvents: [],
  };
}
