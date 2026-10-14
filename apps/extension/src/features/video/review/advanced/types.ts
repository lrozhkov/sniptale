import type { Gradient, Paint } from '@sniptale/foundation/paint';
import type { ReviewTimeSegment } from '../time-segment';
import type { QuickEditWebcam } from './webcam';
import type { ReviewSpeechTranscript } from '../speech-transcript';

export const QUICK_EDIT_ADVANCED_SCHEMA_VERSION = 21;

/** Bumped in v2: v1 placements were stored in source time, v2 stores result time. */
export const QUICK_EDIT_ADVANCED_SCHEMA_V1 = 1;

export interface QuickEditTrackVisibility {
  actions: boolean;
  webcam?: boolean;
  annotationEffects?: boolean;
  zoom: boolean;
  audio: boolean;
}

export interface QuickEditUiState {
  mode: 'basic' | 'advanced';
  /** First entry reveals editing lanes; later mode switches preserve their settings. */
  advancedTracksInitialized?: boolean;
  tracks: QuickEditTrackVisibility;
  /** Editor-only overlay display; the data and the export flag are untouched. */
  overlaysVisible: boolean;
}

export interface QuickEditZoomTransition {
  type: 'none' | 'linear' | 'ease-in-out';
  duration: number;
}

/** Easing of an outgoing zoom link; absent on legacy documents means the smooth default. */
export type QuickEditZoomLinkEasing = 'linear' | 'ease-in-out';

export interface QuickEditPerspective {
  enabled: boolean;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  strength: number;
}

export interface QuickEditDepthOfField {
  enabled: boolean;
  mode: 'area' | 'depth';
  x: number;
  y: number;
  width: number;
  softness: number;
  strength: number;
}

export type SpatialQuaternion = readonly [number, number, number, number];
/** Disposable evaluated pose; never admitted from persisted camera objects. */
export interface QuickEditSpatialFrame {
  rotation: SpatialQuaternion;
  perspective: number;
  windowMotion: number;
  lockBackground: boolean;
  focus: readonly { settings: QuickEditDepthOfField; weight: number }[];
}

export interface QuickEditRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Authored scene geometry plus the actual consuming output size. */
export type QuickEditCameraSceneInput = {
  output?: { width: number; height: number };
  canvas?: QuickEditCanvasSize | undefined;
  source: { width: number; height: number };
  background: QuickEditBackgroundSettings;
  windowHeader?: QuickEditWindowHeader | undefined;
};

/** Camera target normalized over the whole window (video plus optional header), excluding background. */
export interface QuickEditCameraTransform {
  /** Evaluated only; storage parsers discard this renderer state. */
  spatial?: QuickEditSpatialFrame;
  scale: number;
  centerX: number;
  centerY: number;
}

/**
 * Zoom interval on the quick-editor timeline. `start`/`end` are timeline seconds,
 * matching the shared ReviewTimeMap coordinate domain.
 */
/** An opening normalized over the decorated window; outside effects cover the composed scene. */
export interface QuickEditSpotlight {
  area: { x: number; y: number; width: number; height: number };
  effect: 'dim' | 'blur';
  strength: number;
  blur: number;
  roundness: number;
  reveal: 'fade' | 'contract';
  exitReveal: 'fade' | 'contract';
}

/** Window-normalized annotation, including decoration; transitions own immediate entrance/exit. */
export interface QuickEditBorder {
  area: { x: number; y: number; width: number; height: number };
  color: string;
  width: number;
  roundness: number;
  style: 'solid' | 'dashed' | 'dotted';
  reveal: 'fade' | 'draw' | 'draw-ccw';
  exitReveal: 'fade' | 'erase' | 'erase-ccw';
  loop: boolean;
  motion: 'clockwise' | 'counterclockwise' | 'pulse' | 'ripple';
  period: number;
  segmentPercent: number;
}

export interface QuickEditZoomRegion {
  cameraFollow?: import('../../project/camera/cursor-policy').CameraFollowSettings;
  /** Explicit local camera policy; absence inherits the scene cursor-focus mode. */
  followCursor?: boolean;
  /** Disposable render context, dropped by storage admission. */
  cursorFocus?: {
    scene?: QuickEditCameraSceneInput;
    policy?: import('../../project/camera/cursor-policy').ResolvedCameraFollowPolicy;
    sourceFrame?: { headerHeight: number; height: number };
    path: import('../../project/cursor-focus-path/types').CursorFocusPath;
    observed?: import('../../project/cursor-focus-path/types').CursorFocusPath;
    timeMap?: readonly ReviewTimeSegment[];
  };
  perspective?: QuickEditPerspective;
  depthOfField?: QuickEditDepthOfField;
  /** Optional camera exposure; absent or disabled leaves legacy rendering unchanged. */
  motionBlur?: Partial<Record<'enter' | 'exit' | 'link', { enabled: boolean; strength: number }>>;
  border?: QuickEditBorder;
  /** Derived only; parser drops this projection clock before persistence admission. */
  borderClock?: {
    offset: number;
    rate: number;
    duration: number;
    enter: QuickEditZoomTransition;
    exit: QuickEditZoomTransition;
  };
  spotlight?: QuickEditSpotlight;
  id: string;
  start: number;
  end: number;
  /** Authored source-frame footprint retained when result-time cuts hide all or part of the region. */
  sourceAnchor?: { start: number; end: number };
  transform: QuickEditCameraTransform;
  enter: QuickEditZoomTransition;
  exit: QuickEditZoomTransition;
  /** Optional smooth connection to the next region; ignored if that target is no longer adjacent. */
  linkTo?: string;
  /** Link easing; absent on legacy payloads applies the smooth default. */
  linkEasing?: QuickEditZoomLinkEasing;
  /** Kept but not applied: its interval could not be proven in result time. */
  dormant?: boolean;
}

export interface QuickEditZoomState {
  enabled: boolean;
  regions: QuickEditZoomRegion[];
}

export interface QuickEditBackgroundLayout {
  /** Source-canvas pixels; absent in older workspaces means no blur. */
  blur?: number;
  padding: number;
  cornerRadius: number;
  shadow?: { intensity: number; color: string };
}

export type QuickEditBackgroundSettings = {
  /** Last authored fill retained in image/disabled mode. */
  rememberedPaint?: Paint;
  /** Last authored geometry retained while the background is disabled. */
  rememberedLayout?: QuickEditBackgroundLayout;
  /** Last image retained while another background kind is active; reuses its project asset. */
  rememberedImage?: { assetId: string; imageFit: 'cover' | 'contain' };
  /** New modes zoom the joined video/header window over a fixed canvas; legacy values retain their rendering. */
  zoomBehavior?: 'fixed' | 'follow-video' | 'window' | 'content';
} & (
  | { enabled: false }
  | {
      enabled: true;
      type: 'solid';
      color: string;
      layout: QuickEditBackgroundLayout;
    }
  | {
      enabled: true;
      type: 'gradient';
      gradient: Gradient;
      layout: QuickEditBackgroundLayout;
    }
  | {
      enabled: true;
      type: 'image';
      assetId: string;
      imageFit: 'cover' | 'contain';
      layout: QuickEditBackgroundLayout;
    }
);

/** One voiceover or music clip; timeline coordinates are seconds like the video domain. */
export interface QuickEditVoiceoverAnchor {
  start: number;
  end: number;
  offset: number;
  duration: number;
}

export interface QuickEditAudioClip {
  /** Immutable text association; deleting or editing text does not delete this audio. */
  textSnapshot?: import('../text-document').ReviewVoiceTextSnapshot;
  /** Optional native-asset transcript and immutable accepted speech replacements. */
  transcript?: ReviewSpeechTranscript;
  /** Native sample tempo, independent of video Speed; absent means 1x. */
  tempo?: number;
  /** Lossless source-video placement; audio offsets remain relative to the intact recording. */
  sourceAnchor?: QuickEditVoiceoverAnchor[];
  /** Derived playback projection only; storage parsing intentionally drops these fields. */
  playbackRate?: number;
  fadePhase?: { offset: number; duration: number };
  id: string;
  assetId: string;
  /** Kept but not applied: its start could not be proven in result time. */
  dormant?: boolean;
  timelineStart: number;
  sourceOffset: number;
  duration: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

export interface QuickEditOriginalAudioRange {
  id: string;
  start: number;
  end: number;
  volume: number;
}

/** Source attenuation follows an ordinary take until its first manual range edit. */
export type QuickEditOriginalAudioMute =
  | { id: string; kind: 'take'; clipId: string }
  | (QuickEditOriginalAudioRange & { kind: 'range' });

export interface QuickEditOriginalAudio {
  /** Source seconds, independent of result-time edits. */
  ranges?: QuickEditOriginalAudioRange[];
  /** Independent overlays preserve the authored manual gain envelope underneath. */
  mutes?: QuickEditOriginalAudioMute[];
  muted: boolean;
  volume: number;
}

/** Source coordinates remain independent of the decorated window. */
export type QuickEditWindowHeader = import('../../../browser-frame/header').WindowHeader;

/** An explicit base canvas size; absence means native source dimensions. */
export interface QuickEditCanvasSize {
  width: number;
  height: number;
  /** Static source-normalized crop. Omission retains the complete source. */
  crop?: QuickEditRect;
}

export interface QuickEditAudioState {
  /** Admitted alpha metadata; playback uses ordinary voiceover clips only. */
  originalSpeech?: import('../speech-transcript').ReviewOriginalSpeech;
  /** Current video mapping used only to project anchored voiceover into playback slices. */
  voiceoverSegments?: ReviewTimeSegment[];
  /** Master gains multiply individual clip gains; omitted means unity. */
  laneVolumes?: { voiceover: number; music: number };
  original: QuickEditOriginalAudio;
  voiceover: QuickEditAudioClip[];
  music: QuickEditAudioClip[];
}

/** Advanced quick-editor state persisted beside the edit history in the same workspace record. */
export interface QuickEditAdvancedState extends QuickEditAdvancedContent {
  ui: QuickEditUiState;
  /** Raw v1 payload retained by the deterministic load-time migration. */
  recoveryV1?: string;
}

/**
 * Advanced content without editor chrome: the part that changes the rendered
 * result. It lives in the review history as `advancedContent` operations, so
 * zoom/background/audio changes join the same undo timeline as cuts.
 */
export interface QuickEditAdvancedContent {
  cameraFollowDefaults?: import('../../project/camera/cursor-policy').CameraFollowSettings;
  cursorFocusPath?: import('../../project/cursor-focus-path/types').CursorFocusPath;
  text?: import('../text-document').ReviewTextDocument;
  captions?: import('../text-document').ReviewCaptionSettings;
  annotationEffects?: import('../annotation-effects/types').ReviewAnnotationEffects;
  /** Missing on older projects means enabled. */
  actionsEnabled?: boolean;
  keyAnimations?: import('./key-animation').ReviewKeyAnimation[];
  clickAnimations?: import('./click-animation').ReviewClickAnimation[];
  actionAudio?: import('./action-audio').ReviewActionAudioSetting[];
  /** Version travels with each history payload so persisted operations are fixed-point parseable. */
  schemaVersion: typeof QUICK_EDIT_ADVANCED_SCHEMA_VERSION;
  zoom: QuickEditZoomState;
  background: QuickEditBackgroundSettings;
  canvas?: QuickEditCanvasSize;
  windowHeader?: QuickEditWindowHeader;
  webcam?: QuickEditWebcam;
  watermark?: import('./watermark').QuickEditWatermarkSettings;
  presentation?: import('./presentation').QuickEditPresentationSettings;
  audio: QuickEditAudioState;
}
