import type {
  NativeScreenshotSettings,
  NativeVideoFrameRate,
  NativeVideoSettings,
  VideoQuality,
} from '../video/types/types';
import type { NativeAudioSource, NativeCapabilityUnavailableReason } from './platform-types';

export type NativeTrayActionKind =
  | 'open-settings'
  | 'capture-screenshot'
  | 'start-recording'
  | 'stop-recording'
  | 'pause-recording'
  | 'resume-recording'
  | 'open-gallery'
  | 'open-video-editor';

export interface NativeTrayActionDescriptor {
  enabled: boolean;
  id: string;
  kind: NativeTrayActionKind;
  label: string;
  shortcutLabel?: string;
  warning?: string;
  offlineCapable?: boolean;
}

export interface NativeTrayShortcutPriority {
  shortcutLabels: string[];
  when: 'browser-active';
  winner: 'extension';
}

export interface NativeTrayActionRegistry {
  actions: NativeTrayActionDescriptor[];
  revision: string;
  shortcutPriority?: NativeTrayShortcutPriority;
}

export interface NativeRequestedQualitySettings {
  audioBitrateKbps: 96 | 128 | 160 | 192;
  audioSourceMode: NativeAudioSource;
  frameRate: NativeVideoFrameRate;
  quality: VideoQuality;
  videoBitrateMbpsOverride: number | null;
}

export interface NativeSettingsWarning {
  code: NativeCapabilityUnavailableReason | 'clamped' | 'unsupported-capability' | 'unknown';
  field?: string;
  message?: string;
}

export interface NativeEffectiveQualitySettings extends NativeRequestedQualitySettings {
  effectiveAudioBitrateKbps: number;
  effectiveFps: number;
  effectiveVideoBitrateMbps: number;
  encoder: 'hardware' | 'software';
  warnings: NativeSettingsWarning[];
}

export interface NativeEffectiveSettings {
  screenshots: NativeScreenshotSettings;
  video: NativeVideoSettings;
  warnings: NativeSettingsWarning[];
}
