import type { Gradient } from '@sniptale/foundation/paint';

export const QUICK_EDIT_ADVANCED_SCHEMA_VERSION = 2;

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

/** Camera target in normalized content coordinates, independent of background layout. */
export interface QuickEditCameraTransform {
  scale: number;
  centerX: number;
  centerY: number;
}

/**
 * Zoom interval on the quick-editor timeline. `start`/`end` are timeline seconds,
 * matching the shared ReviewTimeMap coordinate domain.
 */
/** A source-normalized opening; outside effects cover the entire composed scene. */
export interface QuickEditSpotlight {
  area: { x: number; y: number; width: number; height: number };
  effect: 'dim' | 'blur';
  strength: number;
  blur: number;
  roundness: number;
  reveal: 'fade' | 'contract';
}

export interface QuickEditZoomRegion {
  spotlight?: QuickEditSpotlight;
  id: string;
  start: number;
  end: number;
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
}

export type QuickEditBackgroundSettings =
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
    };

/** One voiceover or music clip; timeline coordinates are seconds like the video domain. */
export interface QuickEditVoiceoverAnchor {
  start: number;
  end: number;
  offset: number;
  duration: number;
}

export interface QuickEditAudioClip {
  /** Lossless source-video placement; audio offsets remain relative to the intact recording. */
  sourceAnchor?: QuickEditVoiceoverAnchor[];
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

export interface QuickEditOriginalAudio {
  muted: boolean;
  volume: number;
}

/** An explicit output size; absence means the native source canvas. */
export interface QuickEditCanvasSize {
  width: number;
  height: number;
}

export interface QuickEditAudioState {
  /** Current video mapping used only to project anchored voiceover into playback slices. */
  voiceoverSegments?: import('../timeline').ReviewTimeSegment[];
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
  audio: QuickEditAudioState;
}
