import type { RecordingTelemetrySignal } from '../types/interaction';

/** Recorded identity is scoped by kind; an action and signal may share their opaque ID. */
export interface ReviewActionAudioRef {
  kind: 'action' | 'signal';
  id: string;
}
export type ReviewActionAudioPreset =
  | 'mouse-classic-v1'
  | 'mouse-alternate-v1'
  | 'mouse-soft-v1'
  | 'keyboard-v1'
  | 'typing-natural-v1'
  | 'mouse-classic-paired-v2'
  | 'mouse-soft-paired-v2'
  | 'keyboard-recorded-v2'
  | 'typing-recorded-v2';
export type ReviewActionAudioFamily = 'mouse' | 'keyboard' | 'typing';
export interface ReviewActionAudioStyle {
  enabled: boolean;
  presetId: ReviewActionAudioPreset | null;
  volume: number;
  offset: number;
  downEnabled?: boolean;
  upEnabled?: boolean;
  downGain?: number;
  upGain?: number;
  includeRepeats?: boolean;
}
export interface ReviewActionAudioSetting extends ReviewActionAudioStyle {
  ref: ReviewActionAudioRef;
}
export interface ReviewActionAudioTarget {
  recorded?: boolean;
  ref: ReviewActionAudioRef;
  family: ReviewActionAudioFamily;
}
export type ReviewActionAudioPatch = Partial<ReviewActionAudioStyle>;

/** Authored presentation only; recorded time, coordinates and cursor samples stay immutable. */
export interface ReviewClickStyle {
  effect: 'off' | 'ripple' | 'press' | 'glow' | 'magnify';
  magnification?: number;
  lensShape?: 'circle' | 'rounded';
  lensShadow?: number;
  gestureAppearance?: 'halo' | 'path' | 'area';
  gestureArea?: { x: number; y: number; width: number; height: number };
  color: string;
  radius: number;
  stroke: number;
  /** Legacy multiplier retained for history replay; new colors carry their own alpha. */
  opacity: number;
  before: number;
  after: number;
  offset: number;
  x: number;
  y: number;
  pulses: number;
  easing: 'linear' | 'ease-out' | 'ease-in-out';
}
export interface ReviewClickAnimation extends ReviewClickStyle {
  id: string;
}

/** Authored feedback scoped to one immutable source instance; source-time signals remain capture facts. */
export interface VideoProjectActionFeedback {
  recordingId: string;
  sourceInstanceId: string;
  settings: ReviewActionAudioSetting[];
  signals: RecordingTelemetrySignal[];
  gestureStyles?: ReviewClickAnimation[];
}
