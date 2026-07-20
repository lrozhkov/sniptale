export type NativeVideoFrameRate = 'auto' | 24 | 30 | 60;
export type NativeAudioSourceMode = 'microphone' | 'system' | 'mixed';

export interface NativeVideoAdvancedSettings {
  audioBitrateKbps: 96 | 128 | 160 | 192;
  audioSourceMode: NativeAudioSourceMode;
  frameRate: NativeVideoFrameRate;
  includeCursorInVideo: boolean;
  maxDurationMinutes: number;
  preferHardwareEncoder: boolean;
  videoBitrateMbpsOverride: number | null;
}

export interface NativeVideoCodecSettings {
  audioCodec: 'aac';
  container: 'mp4';
  hardwareAcceleration: 'prefer' | 'force-software';
  videoCodec: 'h264';
}

export interface NativeVideoSettings {
  advanced: NativeVideoAdvancedSettings;
  codec: NativeVideoCodecSettings;
  enabled: boolean;
  telemetry: {
    collectCursor: boolean;
    collectClicks: boolean;
    collectKeyEvents: boolean;
    collectTypingSpans: boolean;
    collectStaticSignals: boolean;
  };
}

export interface NativeScreenshotSettings {
  includeCursor: boolean;
}

export interface NativeTrayActionSetting {
  enabled: boolean;
  offlineCapable: boolean;
  shortcutLabel: string;
}

export const NATIVE_TRAY_ACTION_KEYS = [
  'openSettings',
  'openGallery',
  'openVideoEditor',
  'captureScreenScreenshot',
  'captureWindowScreenshot',
  'captureAllScreensScreenshot',
  'captureRegionScreenshot',
  'startScreenRecording',
  'startWindowRecording',
  'startRegionRecording',
  'pauseRecording',
  'resumeRecording',
  'stopRecording',
] as const;

export type NativeTrayActionKey = (typeof NATIVE_TRAY_ACTION_KEYS)[number];

export type NativeTrayActionSettings = Record<NativeTrayActionKey, NativeTrayActionSetting>;

export interface NativeCaptureSettings {
  screenshots: NativeScreenshotSettings;
  trayActions: NativeTrayActionSettings;
  video: NativeVideoSettings;
}
