import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';

// Wire fixture. Desktop owns these values in production.
export const nativeSettingsFixture: NativeCaptureSettings = {
  screenshots: {
    includeCursor: true,
  },
  trayActions: {
    openGallery: { enabled: true, offlineCapable: false, shortcutLabel: '' },
    openSettings: { enabled: true, offlineCapable: true, shortcutLabel: '' },
    openVideoEditor: { enabled: true, offlineCapable: false, shortcutLabel: '' },
    captureScreenScreenshot: {
      enabled: true,
      offlineCapable: false,
      shortcutLabel: 'PrintScreen',
    },
    captureWindowScreenshot: { enabled: true, offlineCapable: false, shortcutLabel: '' },
    captureAllScreensScreenshot: { enabled: false, offlineCapable: false, shortcutLabel: '' },
    captureRegionScreenshot: { enabled: true, offlineCapable: false, shortcutLabel: '' },
    startScreenRecording: { enabled: true, offlineCapable: false, shortcutLabel: 'Ctrl+Shift+R' },
    startWindowRecording: { enabled: true, offlineCapable: false, shortcutLabel: '' },
    startRegionRecording: { enabled: true, offlineCapable: false, shortcutLabel: '' },
    pauseRecording: { enabled: false, offlineCapable: false, shortcutLabel: '' },
    resumeRecording: { enabled: false, offlineCapable: false, shortcutLabel: '' },
    stopRecording: { enabled: false, offlineCapable: false, shortcutLabel: 'Ctrl+Shift+S' },
  },
  video: {
    advanced: {
      audioBitrateKbps: 160,
      audioSourceMode: 'mixed',
      frameRate: 'auto',
      includeCursorInVideo: true,
      maxDurationMinutes: 120,
      preferHardwareEncoder: true,
      videoBitrateMbpsOverride: null,
    },
    codec: {
      audioCodec: 'aac',
      container: 'mp4',
      hardwareAcceleration: 'prefer',
      videoCodec: 'h264',
    },
    enabled: false,
    telemetry: {
      collectClicks: true,
      collectCursor: true,
      collectKeyEvents: true,
      collectStaticSignals: true,
      collectTypingSpans: true,
    },
  },
};
