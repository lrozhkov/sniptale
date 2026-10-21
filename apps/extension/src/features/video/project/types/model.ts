import type { CameraHiddenRange } from '../camera/visibility';
import type { CameraAppearance, CameraCrop } from '../camera/appearance';
import type { VideoProjectVoiceTextSnapshot } from '../text/types';
import type { VideoMediaFitMode } from './media';
import type {
  VideoProjectActionEvent,
  VideoProjectActionPresentation,
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

interface CameraPosition {
  /** An absent destination crop inherits the clip-wide source framing. */
  crop?: CameraCrop;
  id: string;
  /** Source seconds keep the trajectory continuous across trims, splits and rate changes. */
  sourceTime: number;
  transform: VideoProjectTransform;
  fitMode: VideoMediaFitMode;
  transition: { kind: 'instant' | 'smooth' | 'shrink'; duration: number };
}

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
      /** Stable library identity survives deletion of its originating workspace. */
      kind: 'library-asset';
      mediaId: string;
    }
  | {
      kind: 'recording';
      recordingId: string;
    }
  | {
      kind: 'project-asset';
      projectAssetId: string;
      originRecordingId?: string;
      /** Library insertion identity; rendering uses the project-owned representation. */
      originMediaId?: string;
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
  /** Source composition survives deleting montage clips; groupId belongs to each insertion. */
  recordingPart?: {
    recordingId: string;
    role: 'primary' | 'camera' | 'video' | 'audio';
  };
  createdAt: number;
}

interface VideoProjectBaseClip {
  effectsBypassed?: boolean;
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
  /** Camera-native source seconds survive cuts, rates and project moves. */
  cameraHiddenRanges?: CameraHiddenRange[];
  cameraPositions?: CameraPosition[];
  cameraAppearance?: CameraAppearance;
  /** Reflect camera pixels within their window; the source clock and placement stay unchanged. */
  cameraMirrored?: boolean;
  type: typeof VideoProjectClipType.VIDEO;
  assetId: string;
  /** A placement's identity survives cuts and timing edits; a duplicate gets a new identity. */
  sourceInstanceId?: string;
  playbackRate?: number;
  sourceStart: number;
  sourceDuration: number;
}

export interface VideoProjectAudioClip extends VideoProjectBaseClip {
  /** Independent attenuation follows this take; targets confer no resource ownership. */
  originalAudioMute?: {
    volume: number;
    targets: { assetId: string; sourceInstanceId: string }[];
  };
  /** Accepted speech keeps its original text even after that text or source is removed. */
  textSnapshot?: VideoProjectVoiceTextSnapshot;
  /** Stable text/speech placement identity; split retains it and duplicate replaces it. */
  sourceInstanceId?: string;
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
  videoEffectsBypassed?: boolean;
  version:
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20
    | 21
    | 22
    | 23
    | 24
    | 25
    | 26
    | 27;
  commentDocuments?: import('../comments/types').VideoProjectCommentDocument[];
  textDocuments?: import('../text/types').VideoProjectTextDocument[];
  cameraFollowDefaults?: import('../camera/cursor-policy').CameraFollowSettings;
  id: string;
  name: string;
  source: VideoProjectSource;
  baseRecordingId: string | null;
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  sceneBackground?: VideoProjectSceneBackground;
  /** Final-canvas watermark; image references name a declared project material. */
  watermark?: import('../scene/watermark-types').QuickEditWatermarkSettings;
  /** Project-clock presentation after the complete visual and audio composition. */
  sceneEdges?: import('../scene/edge-fades').VideoProjectSceneEdges;
  /** Authored insertion recipes; existing timeline instances remain independent. */
  bookendPresets?: import('../scene/bookend-presets-types').VideoProjectBookendPresets;
  /** Whole-frame joins retain explicit ordinary media clip-edge anchors. */
  compositionJoins?: import('../scene/joins-types').VideoProjectCompositionJoin[];
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
  /** Authored focus geometry never replaces retained recording samples. */
  actionFeedback?: import('../action-feedback/types').VideoProjectActionFeedback[];
  cursorFocusPath?: import('../cursor-focus-path/types').CursorFocusPath;
  cursorTrack: VideoProjectCursorTrack | null;
  actionEvents: VideoProjectActionEvent[];
  actionPresentation?: VideoProjectActionPresentation;
}
