import type { Gradient } from '@sniptale/foundation/paint';

export const QUICK_EDIT_ADVANCED_SCHEMA_VERSION = 1;

export interface QuickEditTrackVisibility {
  actions: boolean;
  zoom: boolean;
  audio: boolean;
}

export interface QuickEditUiState {
  mode: 'basic' | 'advanced';
  tracks: QuickEditTrackVisibility;
}

export interface QuickEditZoomTransition {
  type: 'none' | 'linear' | 'ease-in-out';
  durationMs: number;
}

/** Camera target in normalized content coordinates, independent of background layout. */
export interface QuickEditCameraTransform {
  scale: number;
  centerX: number;
  centerY: number;
}

export interface QuickEditZoomRegion {
  id: string;
  startMs: number;
  endMs: number;
  transform: QuickEditCameraTransform;
  enter: QuickEditZoomTransition;
  exit: QuickEditZoomTransition;
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

export interface QuickEditAudioClip {
  id: string;
  assetId: string;
  timelineStartMs: number;
  sourceOffsetMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
}

export interface QuickEditOriginalAudio {
  muted: boolean;
  volume: number;
}

export interface QuickEditAudioState {
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
  audio: QuickEditAudioState;
}
