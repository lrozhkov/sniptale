import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  type VideoProject,
  type VideoProjectClip,
  VideoProjectClipType,
  VideoProjectShapeType,
  VideoTimelinePlacementMode,
  VideoTrackKind,
} from '../types/index';

export function createTransform(opacity = 1) {
  return {
    height: 720,
    opacity,
    rotation: 0,
    width: 1280,
    x: 0,
    y: 0,
  };
}

function createTrack(id: string) {
  return {
    id,
    kind: VideoTrackKind.PRIMARY,
    locked: false,
    name: id,
    order: 0,
    visible: true,
  };
}

export function createVideoClip(
  overrides: Partial<Extract<VideoProjectClip, { type: typeof VideoProjectClipType.VIDEO }>> = {}
): Extract<VideoProjectClip, { type: typeof VideoProjectClipType.VIDEO }> {
  return {
    assetId: 'asset-video',
    duration: 4,
    fadeInMs: 500,
    fadeOutMs: 500,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'video-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Video',
    sourceDuration: 4,
    sourceStart: 0,
    startTime: 1,
    trackId: 'track-main',
    transform: createTransform(0.8),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 0.9,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
    ...overrides,
  };
}

export function createTextClip(
  overrides: Partial<Extract<VideoProjectClip, { type: typeof VideoProjectClipType.TEXT }>> = {}
): Extract<VideoProjectClip, { type: typeof VideoProjectClipType.TEXT }> {
  return {
    duration: 2,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'text-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Text',
    startTime: 0,
    style: {
      backgroundColor: '#000',
      borderColor: '#fff',
      borderRadius: 0,
      borderWidth: 0,
      color: '#fff',
      fontFamily: 'sans',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.4,
      padding: 0,
      textAlign: 'left',
    },
    text: 'Hello',
    trackId: 'track-main',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.TEXT,
    volume: 1,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
    ...overrides,
  };
}

export function createShapeClip(
  overrides: Partial<Extract<VideoProjectClip, { type: typeof VideoProjectClipType.SHAPE }>> = {}
): Extract<VideoProjectClip, { type: typeof VideoProjectClipType.SHAPE }> {
  return {
    duration: 2,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'shape-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Shape',
    shapeType: VideoProjectShapeType.RECTANGLE,
    startTime: 0,
    style: {
      borderRadius: 0,
      fillColor: '#111',
      strokeColor: '#eee',
      strokeWidth: 1,
    },
    trackId: 'track-main',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.SHAPE,
    volume: 1,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
    ...overrides,
  };
}

export function createProject(clips: VideoProjectClip[]): VideoProject {
  return {
    actionEvents: [],
    assets: [],
    backgroundColor: '#000',
    baseRecordingId: null,
    clips,
    createdAt: 1,
    cursorTrack: null,
    duration: 10,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Demo',
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    tracks: [createTrack('track-main')],
    updatedAt: 1,
    version: 2,
    width: 1280,
  };
}
