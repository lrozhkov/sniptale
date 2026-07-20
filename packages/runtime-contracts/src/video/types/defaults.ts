import type { VideoQualityConfig } from './annotations';
import { VideoQuality } from './types';
import { VideoAutoProcessingAction } from './types';
import type { VideoAutoProcessingSettings, VideoRecordingSettings } from './types';
import { DEFAULT_WEBCAM_QUALITY_SETTINGS } from './webcam-quality';

export const VIDEO_QUALITY_CONFIGS: Record<VideoQuality, VideoQualityConfig> = {
  [VideoQuality.ULTRA]: {
    mimeType: 'video/webm;codecs=vp9,opus',
    videoBitsPerSecond: 15000000,
    frameRate: 60,
  },
  [VideoQuality.HIGH]: {
    mimeType: 'video/webm;codecs=vp9,opus',
    videoBitsPerSecond: 12000000,
    frameRate: 30,
  },
  [VideoQuality.MEDIUM]: {
    mimeType: 'video/webm;codecs=vp8,opus',
    videoBitsPerSecond: 9000000,
    frameRate: 30,
  },
  [VideoQuality.LOW]: {
    mimeType: 'video/webm;codecs=vp8,opus',
    videoBitsPerSecond: 5000000,
    frameRate: 24,
  },
};

export const DEFAULT_VIDEO_SETTINGS: VideoRecordingSettings = {
  microphoneEnabled: false,
  microphoneDeviceId: null,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  microphoneGain: 1,
  webcamEnabled: false,
  webcamDeviceId: null,
  webcamQuality: DEFAULT_WEBCAM_QUALITY_SETTINGS,
  systemAudioEnabled: true,
  sourceCount: 1,
  quality: VideoQuality.HIGH,
  countdownSeconds: 3,
  autoFadeDelay: 3,
  openEditorAfterRecording: false,
  diagnosticsEnabled: false,
  controlledCursorCaptureEnabled: false,
  native: {
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
  },
};

export const DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS: VideoAutoProcessingSettings = {
  enabled: false,
  stableSegments: {
    action: VideoAutoProcessingAction.SPEED_UP,
    minDurationSeconds: 0.75,
    mergeGapSeconds: 0.5,
    shoulderSeconds: 0.4,
    speedUpPlaybackRate: 2.4,
  },
};
