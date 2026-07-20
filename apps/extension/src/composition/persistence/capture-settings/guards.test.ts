import { describe, expect, it } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { parseStoredVideoSettings, parseStoredVideoUiState } from './guards';

describe('video guards roots', () => {
  it('returns empty values for undefined and marks invalid non-record roots', () => {
    expect(parseStoredVideoSettings(undefined)).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {},
    });
    expect(parseStoredVideoUiState(undefined)).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {},
    });

    expect(parseStoredVideoSettings('broken-root')).toEqual({
      hasInvalidRoot: true,
      invalidFieldCount: 0,
      value: {},
    });
    expect(parseStoredVideoUiState(42)).toEqual({
      hasInvalidRoot: true,
      invalidFieldCount: 0,
      value: {},
    });
  });
});

describe('video guards valid settings', () => {
  registerFullVideoSettingsTests();
  registerPartialVideoSettingsTests();
  registerCompleteNativeSettingsTests();
  registerLegacyNativeSettingsTests();
});

function registerFullVideoSettingsTests() {
  it('parses a fully valid video settings payload', () => {
    expect(
      parseStoredVideoSettings({
        autoFadeDelay: 250,
        countdownSeconds: 3,
        diagnosticsEnabled: true,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        microphoneGain: 1.5,
        microphoneDeviceId: null,
        microphoneEnabled: true,
        openEditorAfterRecording: false,
        quality: VideoQuality.HIGH,
        sourceCount: 2,
        systemAudioEnabled: true,
        webcamDeviceId: 'cam-1',
        webcamEnabled: true,
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {
        autoFadeDelay: 250,
        countdownSeconds: 3,
        diagnosticsEnabled: true,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        microphoneGain: 1.5,
        microphoneDeviceId: null,
        microphoneEnabled: true,
        openEditorAfterRecording: false,
        quality: VideoQuality.HIGH,
        sourceCount: 2,
        systemAudioEnabled: true,
        webcamDeviceId: 'cam-1',
        webcamEnabled: true,
      },
    });
  });
}

function registerPartialVideoSettingsTests() {
  it('clamps stored source counts to the supported multi-source range', () => {
    expect(parseStoredVideoSettings({ sourceCount: 0 }).value).toEqual({ sourceCount: 1 });
    expect(parseStoredVideoSettings({ sourceCount: 8 }).value).toEqual({ sourceCount: 3 });
  });

  it('clamps stored microphone gain to the supported software range', () => {
    expect(parseStoredVideoSettings({ microphoneGain: -1 }).value).toEqual({ microphoneGain: 0 });
    expect(parseStoredVideoSettings({ microphoneGain: 3 }).value).toEqual({ microphoneGain: 2 });
  });

  it('keeps partial valid settings without requiring every optional field', () => {
    expect(
      parseStoredVideoSettings({
        microphoneEnabled: false,
        webcamDeviceId: null,
        webcamEnabled: false,
        quality: VideoQuality.LOW,
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {
        microphoneEnabled: false,
        webcamDeviceId: null,
        webcamEnabled: false,
        quality: VideoQuality.LOW,
      },
    });
  });
}

function registerCompleteNativeSettingsTests() {
  it('parses a complete native settings snapshot and rejects partial native payloads', () => {
    const native = createCompleteNativeSettings();

    expect(parseStoredVideoSettings({ native }).value).toEqual({ native });
    expect(parseStoredVideoSettings({ native: { video: { enabled: true } } })).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 1,
      value: {},
    });
  });
}

function registerLegacyNativeSettingsTests() {
  it('migrates legacy native settings without dropping existing video fields', () => {
    const defaultTrayActions = DEFAULT_VIDEO_SETTINGS.native?.trayActions;
    const legacyNative = {
      screenshots: { includeCursor: false },
      trayActions: {
        captureScreenshot: { enabled: true, offlineCapable: false, shortcutLabel: 'PrintScreen' },
        openGallery: { enabled: true, offlineCapable: false, shortcutLabel: 'Ctrl+G' },
        openSettings: { enabled: true, offlineCapable: true, shortcutLabel: 'Ctrl+Alt+S' },
        startRecording: { enabled: true, offlineCapable: false, shortcutLabel: 'Ctrl+Shift+R' },
        stopRecording: { enabled: false, offlineCapable: false, shortcutLabel: 'Ctrl+Shift+S' },
      },
      video: {
        ...DEFAULT_VIDEO_SETTINGS.native?.video,
        enabled: true,
      },
    };

    expect(parseStoredVideoSettings({ native: legacyNative }).value).toEqual({
      native: {
        screenshots: legacyNative.screenshots,
        trayActions: {
          ...defaultTrayActions,
          captureScreenScreenshot: {
            enabled: true,
            offlineCapable: false,
            shortcutLabel: 'PrintScreen',
          },
          openGallery: { enabled: true, offlineCapable: false, shortcutLabel: 'Ctrl+G' },
          openSettings: { enabled: true, offlineCapable: true, shortcutLabel: 'Ctrl+Alt+S' },
          startScreenRecording: {
            enabled: true,
            offlineCapable: false,
            shortcutLabel: 'Ctrl+Shift+R',
          },
          stopRecording: { enabled: false, offlineCapable: false, shortcutLabel: 'Ctrl+Shift+S' },
        },
        video: legacyNative.video,
      },
    });
  });
}

function createCompleteNativeSettings() {
  return {
    screenshots: { includeCursor: true },
    trayActions: {
      ...DEFAULT_VIDEO_SETTINGS.native?.trayActions,
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
      enabled: true,
      telemetry: {
        collectClicks: true,
        collectCursor: true,
        collectKeyEvents: true,
        collectStaticSignals: true,
        collectTypingSpans: true,
      },
    },
  };
}

describe('video guards invalid settings', () => {
  it('keeps valid settings fields and counts every invalid field', () => {
    expect(
      parseStoredVideoSettings({
        autoFadeDelay: '250',
        countdownSeconds: 3,
        diagnosticsEnabled: 'true',
        microphoneDeviceId: 7,
        microphoneEnabled: true,
        openEditorAfterRecording: false,
        quality: 'BROKEN',
        systemAudioEnabled: null,
        webcamDeviceId: false,
        webcamEnabled: 'yes',
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 7,
      value: {
        countdownSeconds: 3,
        microphoneEnabled: true,
        openEditorAfterRecording: false,
      },
    });
  });
});

describe('video guards ui state', () => {
  it('parses valid capture mode and nullable viewport preset ids', () => {
    expect(
      parseStoredVideoUiState({
        captureMode: CaptureMode.TAB_CROP,
        viewportPresetId: null,
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {
        captureMode: CaptureMode.TAB_CROP,
        viewportPresetId: null,
      },
    });
  });

  it('drops invalid ui state fields while keeping valid ones', () => {
    expect(
      parseStoredVideoUiState({
        captureMode: 'BROKEN_MODE',
        viewportPresetId: 'preset-1',
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 1,
      value: {
        viewportPresetId: 'preset-1',
      },
    });

    expect(
      parseStoredVideoUiState({
        captureMode: CaptureMode.SCREEN,
        viewportPresetId: 7,
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 1,
      value: {
        captureMode: CaptureMode.SCREEN,
      },
    });
  });
});
