import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  type VideoProject,
  type VideoProjectAsset,
  type VideoProjectAudioClip,
  type VideoProjectClip,
  VideoProjectClipType,
  type VideoProjectImageClip,
  type VideoProjectShapeClip,
  VideoProjectShapeType,
  type VideoProjectTextClip,
  type VideoProjectTrack,
  type VideoProjectVideoClip,
  VideoTimelinePlacementMode,
  VideoTrackKind,
  VideoProjectAssetType,
} from '../types/index';

export function createTransform() {
  return {
    height: 720,
    opacity: 1,
    rotation: 0,
    width: 1280,
    x: 0,
    y: 0,
  };
}

export function createTrack(
  id: string,
  order: number,
  kind: VideoTrackKind = VideoTrackKind.PRIMARY,
  visible = true
): VideoProjectTrack {
  return {
    id,
    kind,
    locked: false,
    name: id,
    order,
    visible,
  };
}

function createAsset(id: string, type: VideoProjectAssetType, name = id): VideoProjectAsset {
  return {
    createdAt: 1,
    id,
    metadata: {
      audioPeaks: null,
      duration: 8,
      hasAudio: type !== VideoProjectAssetType.IMAGE,
      height: 720,
      mimeType: 'video/webm',
      size: 100,
      width: 1280,
    },
    name,
    source: {
      kind: 'recording',
      recordingId: `rec-${id}`,
    },
    type,
  };
}

export function createVideoClip(
  overrides: Partial<VideoProjectVideoClip> = {}
): VideoProjectVideoClip {
  return {
    assetId: 'asset-video',
    duration: 8,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-video',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Video clip',
    sourceDuration: 8,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-video',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
    ...overrides,
  };
}

export function createAudioClip(
  overrides: Partial<VideoProjectAudioClip> = {}
): VideoProjectAudioClip {
  return {
    assetId: 'asset-video',
    duration: 8,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'clip-audio',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Audio clip',
    sourceDuration: 8,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-audio',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.AUDIO,
    volume: 1,
    ...overrides,
  };
}

export function createImageClip(
  overrides: Partial<VideoProjectImageClip> = {}
): VideoProjectImageClip {
  return {
    assetId: 'asset-video',
    duration: 8,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-image',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Image clip',
    startTime: 0,
    trackId: 'track-video',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.IMAGE,
    volume: 1,
    ...overrides,
  };
}

export function createTextClip(
  overrides: Partial<VideoProjectTextClip> = {}
): VideoProjectTextClip {
  return {
    duration: 2,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'clip-text',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Text clip',
    startTime: 0,
    style: {
      backgroundColor: '#000',
      borderColor: '#fff',
      borderRadius: 0,
      borderWidth: 0,
      color: '#fff',
      fontFamily: 'system-ui',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.4,
      padding: 0,
      textAlign: 'left',
    },
    text: 'Hello world',
    trackId: 'track-video',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.TEXT,
    volume: 1,
    ...overrides,
  };
}

export function createShapeClip(
  overrides: Partial<VideoProjectShapeClip> = {}
): VideoProjectShapeClip {
  return {
    duration: 2,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'clip-shape',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Shape clip',
    shapeType: VideoProjectShapeType.RECTANGLE,
    startTime: 0,
    style: {
      borderRadius: 0,
      fillColor: '#000',
      strokeColor: '#fff',
      strokeWidth: 1,
    },
    trackId: 'track-video',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.SHAPE,
    volume: 1,
    ...overrides,
  };
}

export function createProject(
  clips: VideoProjectClip[],
  tracks?: VideoProjectTrack[]
): VideoProject {
  return {
    assets: [
      createAsset('asset-video', VideoProjectAssetType.VIDEO, 'Video asset'),
      createAsset('asset-audio', VideoProjectAssetType.AUDIO, 'Audio asset'),
    ],
    backgroundColor: '#000',
    baseRecordingId: null,
    source: { kind: 'manual' },
    clips,
    createdAt: 1,
    duration: 8,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Demo',
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    tracks: tracks ?? [
      createTrack('track-audio', 1, VideoTrackKind.AUDIO),
      createTrack('track-video', 0, VideoTrackKind.PRIMARY),
    ],
    updatedAt: 2,
    version: 2,
    width: 1280,
    cursorTrack: null,
    actionEvents: [],
  };
}
