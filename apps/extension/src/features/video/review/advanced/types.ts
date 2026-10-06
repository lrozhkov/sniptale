import type { Gradient } from '@sniptale/foundation/paint';
import type { ReviewTimeSegment } from '../time-segment';
import type { QuickEditWebcam } from './webcam';

export const QUICK_EDIT_ADVANCED_SCHEMA_VERSION = 3;

/** Bumped in v2: v1 placements were stored in source time, v2 stores result time. */
export const QUICK_EDIT_ADVANCED_SCHEMA_V1 = 1;

export interface QuickEditTrackVisibility {
  actions: boolean;
  zoom: boolean;
  audio: boolean;
}

export interface QuickEditUiState {
  mode: 'basic' | 'advanced';
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

/** Camera target normalized over the whole window (video plus optional header), excluding background. */
export interface QuickEditCameraTransform {
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
  padding: number;
  cornerRadius: number;
  shadow?: { intensity: number; color: string };
}

export type QuickEditBackgroundSettings = {
  /** Absent on legacy workspaces means a stationary background. */
  zoomBehavior?: 'fixed' | 'follow-video';
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

export interface QuickEditOriginalAudio {
  /** Source seconds, independent of result-time edits. */
  ranges?: QuickEditOriginalAudioRange[];
  muted: boolean;
  volume: number;
}

/** Browser is the only supported window decoration; original source coordinates stay unchanged. */
export interface QuickEditWindowHeader {
  kind: 'browser';
  title: string;
  /** Display text only; missing addresses remain blank for legacy headers. */
  url?: string;
}

/** An explicit base canvas size; absence means native source dimensions. */
export interface QuickEditCanvasSize {
  width: number;
  height: number;
}

export interface QuickEditAudioState {
  /** Current video mapping used only to project anchored voiceover into playback slices. */
  voiceoverSegments?: ReviewTimeSegment[];
  /** Master gains multiply individual clip gains; omitted means unity. */
  laneVolumes?: { voiceover: number; music: number };
  original: QuickEditOriginalAudio;
  voiceover: QuickEditAudioClip[];
  music: QuickEditAudioClip[];
}

/** Advanced quick-editor state persisted beside the edit history in the same workspace record. */
export interface QuickEditAdvancedState {
  schemaVersion: typeof QUICK_EDIT_ADVANCED_SCHEMA_VERSION;
  ui: QuickEditUiState;
  zoom: QuickEditZoomState;
  background: QuickEditBackgroundSettings;
  canvas?: QuickEditCanvasSize;
  windowHeader?: QuickEditWindowHeader;
  webcam?: QuickEditWebcam;
  audio: QuickEditAudioState;
  /** Raw v1 payload retained by the deterministic load-time migration. */
  recoveryV1?: string;
}

/**
 * Advanced content without editor chrome: the part that changes the rendered
 * result. It lives in the review history as `advancedContent` operations, so
 * zoom/background/audio changes join the same undo timeline as cuts.
 */
export interface QuickEditAdvancedContent {
  /** Version travels with each history payload so persisted operations are fixed-point parseable. */
  schemaVersion: typeof QUICK_EDIT_ADVANCED_SCHEMA_VERSION;
  zoom: QuickEditZoomState;
  background: QuickEditBackgroundSettings;
  canvas?: QuickEditCanvasSize;
  windowHeader?: QuickEditWindowHeader;
  webcam?: QuickEditWebcam;
  audio: QuickEditAudioState;
}
