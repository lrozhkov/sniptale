import type {
  VideoProjectActionEvent,
  VideoProjectCursorTrack,
  VideoProjectMotionRegion,
  VideoProjectSource,
} from './interaction';
import type { VideoObjectTrack } from '../object-tracks/types';
import type { VideoProjectAnnotationFields } from './annotation';
import type {
  VideoProjectSceneBackground,
  VideoProjectShapeStyle,
  VideoProjectTextStyle,
  VideoProjectTrack,
  VideoProjectTransform,
} from './layout';
import type {
  VideoTemplateDirection,
  VideoTemplateIntensity,
  VideoTransitionRenderKind,
} from './templates';
import type { VideoProjectMediaVisualFields } from './media';
import { VideoTransitionTemplateKind } from './templates';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../effect-instance/types';

export const VideoProjectAssetType = {
  RECORDING: 'RECORDING',
  VIDEO: 'VIDEO',
  IMAGE: 'IMAGE',
  AUDIO: 'AUDIO',
} as const;

export type VideoProjectAssetType =
  (typeof VideoProjectAssetType)[keyof typeof VideoProjectAssetType];

export const VideoProjectClipType = {
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  IMAGE: 'IMAGE',
  TEXT: 'TEXT',
  ANNOTATION: 'ANNOTATION',
  EFFECT: 'EFFECT',
  SUBTITLE: 'SUBTITLE',
  SHAPE: 'SHAPE',
} as const;

export type VideoProjectClipType = (typeof VideoProjectClipType)[keyof typeof VideoProjectClipType];

export const VideoProjectShapeType = {
  RECTANGLE: 'RECTANGLE',
  ELLIPSE: 'ELLIPSE',
  LINE: 'LINE',
  ARROW: 'ARROW',
} as const;

export type VideoProjectShapeType =
  (typeof VideoProjectShapeType)[keyof typeof VideoProjectShapeType];

export const VideoClipLinkMode = {
  LINKED: 'LINKED',
  DETACHED: 'DETACHED',
} as const;

export type VideoClipLinkMode = (typeof VideoClipLinkMode)[keyof typeof VideoClipLinkMode];

export const VideoClipTransitionKind = {
  NONE: 'NONE',
  CROSSFADE: 'CROSSFADE',
} as const;

export type VideoClipTransitionKind =
  (typeof VideoClipTransitionKind)[keyof typeof VideoClipTransitionKind];

export const VideoTransitionKind = {
  ...VideoTransitionTemplateKind,
} as const;

export type VideoTransitionKind = (typeof VideoTransitionKind)[keyof typeof VideoTransitionKind];

export const VideoTransitionEasing = {
  LINEAR: 'LINEAR',
  EASE_IN_OUT: 'EASE_IN_OUT',
} as const;

export type VideoTransitionEasing =
  (typeof VideoTransitionEasing)[keyof typeof VideoTransitionEasing];

export const VideoTimelinePlacementMode = {
  ALLOW_OVERLAP: 'ALLOW_OVERLAP',
  RIPPLE_PUSH: 'RIPPLE_PUSH',
  OVERWRITE: 'OVERWRITE',
} as const;

export type VideoTimelinePlacementMode =
  (typeof VideoTimelinePlacementMode)[keyof typeof VideoTimelinePlacementMode];

export type VideoProjectAssetSource =
  | {
      kind: 'recording';
      recordingId: string;
    }
  | {
      kind: 'project-asset';
      projectAssetId: string;
      originRecordingId?: string;
    }
  | {
      kind: 'scenario-asset';
      scenarioAssetId: string;
    };

export interface VideoProjectAssetMetadata {
  width: number;
  height: number;
  duration: number | null;
  mimeType: string;
  size: number;
  hasAudio: boolean;
  audioPeaks: number[] | null;
}

export interface VideoProjectAsset {
  id: string;
  type: VideoProjectAssetType;
  name: string;
  source: VideoProjectAssetSource;
  metadata: VideoProjectAssetMetadata;
  createdAt: number;
}

interface VideoProjectBaseClip {
  id: string;
  trackId: string;
  timelineLaneId?: string | null;
  type: VideoProjectClipType;
  name: string;
  groupId: string | null;
  linkMode: VideoClipLinkMode;
  startTime: number;
  duration: number;
  muted: boolean;
  volume: number;
  audioGainStart?: number;
  audioGainEnd?: number;
  volumeEnvelopeStart?: number;
  volumeEnvelopeEnd?: number;
  fadeInMs: number;
  fadeOutMs: number;
  transitionIn: VideoClipTransitionKind;
  transitionOut: VideoClipTransitionKind;
  transform: VideoProjectTransform;
}

export interface VideoProjectTransition {
  id: string;
  leadingClipId: string;
  trailingClipId: string;
  kind: VideoTransitionKind;
  duration: number;
  easing: VideoTransitionEasing;
  templateKind?: VideoTransitionTemplateKind;
  renderKind?: VideoTransitionRenderKind;
  direction?: VideoTemplateDirection;
  intensity?: VideoTemplateIntensity;
  highlightColor?: string;
}

export interface VideoProjectTransitionSegment {
  end: number;
  id: string;
  leadingClip: VideoProjectClip;
  leadingClipId: string;
  start: number;
  trailingClip: VideoProjectClip;
  trailingClipId: string;
  transition: VideoProjectTransition;
}

export interface VideoProjectUtilityLaneState {
  visible: boolean;
  locked: boolean;
}

export interface VideoProjectUtilityLanes {
  actions: VideoProjectUtilityLaneState;
  camera: VideoProjectUtilityLaneState;
}

export interface VideoProjectVideoClip extends VideoProjectBaseClip, VideoProjectMediaVisualFields {
  type: typeof VideoProjectClipType.VIDEO;
  assetId: string;
  playbackRate?: number;
  sourceStart: number;
  sourceDuration: number;
}

export interface VideoProjectAudioClip extends VideoProjectBaseClip {
  type: typeof VideoProjectClipType.AUDIO;
  assetId: string;
  playbackRate?: number;
  sourceStart: number;
  sourceDuration: number;
}

export interface VideoProjectImageClip extends VideoProjectBaseClip, VideoProjectMediaVisualFields {
  type: typeof VideoProjectClipType.IMAGE;
  assetId: string;
}

export interface VideoProjectTextClip extends VideoProjectBaseClip {
  type: typeof VideoProjectClipType.TEXT;
  text: string;
  style: VideoProjectTextStyle;
}

export interface VideoProjectAnnotationClip
  extends VideoProjectBaseClip, VideoProjectAnnotationFields {
  type: typeof VideoProjectClipType.ANNOTATION;
}

/**
 * Extension-owned timeline/canvas host for a standalone EffectV1 instance.
 * Geometry and timing belong to this clip; the referenced instance owns the
 * immutable runtime snapshot and document controls.
 */
export interface VideoProjectEffectClip extends VideoProjectBaseClip {
  type: typeof VideoProjectClipType.EFFECT;
  effectInstanceId: string;
}

export interface VideoProjectSubtitleClip extends VideoProjectBaseClip {
  type: typeof VideoProjectClipType.SUBTITLE;
  text: string;
}

export interface VideoProjectShapeClip extends VideoProjectBaseClip {
  type: typeof VideoProjectClipType.SHAPE;
  shapeType: VideoProjectShapeType;
  style: VideoProjectShapeStyle;
  embeddedAsset?: {
    assetId: string;
    opacity?: number;
    placement: Pick<VideoProjectTransform, 'height' | 'width' | 'x' | 'y'>;
  };
}

export type VideoProjectClip =
  | VideoProjectVideoClip
  | VideoProjectAudioClip
  | VideoProjectImageClip
  | VideoProjectTextClip
  | VideoProjectAnnotationClip
  | VideoProjectEffectClip
  | VideoProjectSubtitleClip
  | VideoProjectShapeClip;

export interface VideoProject {
  version: 2;
  id: string;
  name: string;
  source: VideoProjectSource;
  baseRecordingId: string | null;
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  sceneBackground?: VideoProjectSceneBackground;
  timelinePlacementMode: VideoTimelinePlacementMode;
  duration: number;
  createdAt: number;
  updatedAt: number;
  assets: VideoProjectAsset[];
  tracks: VideoProjectTrack[];
  clips: VideoProjectClip[];
  transitions?: VideoProjectTransition[];
  effectInstances?: VideoProjectEffectInstance[];
  effectSnapshots?: VideoProjectEffectSnapshot[];
  objectTracks?: VideoObjectTrack[];
  utilityLanes?: VideoProjectUtilityLanes;
  motionRegions?: VideoProjectMotionRegion[];
  cursorTrack: VideoProjectCursorTrack | null;
  actionEvents: VideoProjectActionEvent[];
}
