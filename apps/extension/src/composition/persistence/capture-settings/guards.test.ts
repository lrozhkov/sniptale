import { describe, expect, it } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  CaptureMode,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoFrameRate,
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { parseStoredVideoSettings, parseStoredVideoUiState } from './guards';

const CURRENT_VIDEO_SETTINGS_CONTRACT = {
  outputProfile: DEFAULT_VIDEO_SETTINGS.outputProfile,
  qualityProfileId: DEFAULT_VIDEO_SETTINGS.qualityProfileId,
  qualityProfiles: DEFAULT_VIDEO_SETTINGS.qualityProfiles,
};

function parseCurrentVideoSettings(value: Record<string, unknown>) {
  return parseStoredVideoSettings({
    ...CURRENT_VIDEO_SETTINGS_CONTRACT,
    ...value,
  });
}

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

  it('rejects the previous recording-quality schema instead of migrating it', () => {
    expect(parseStoredVideoSettings({ quality: VideoQuality.HIGH })).toEqual({
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
      parseCurrentVideoSettings({
        autoFadeDelay: 30,
        countdownSeconds: 3,
        interactionDiagnosticsEnabled: true,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        microphoneGain: 1.5,
        microphoneDeviceId: null,
        microphoneEnabled: true,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          quality: VideoQuality.HIGH,
        },
        sourceCount: 2,
        systemAudioEnabled: true,
        recordingSurface: {
          toolbarEnabled: true,
          cursorSpotlightEnabled: true,
          cursorDimmingEnabled: false,
          cursorClickAnimationEnabled: false,
        },
        webcamDeviceId: 'cam-1',
        webcamEnabled: true,
        webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation,
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {
        ...CURRENT_VIDEO_SETTINGS_CONTRACT,
        autoFadeDelay: 30,
        countdownSeconds: 3,
        interactionDiagnosticsEnabled: true,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        microphoneGain: 1.5,
        microphoneDeviceId: null,
        microphoneEnabled: true,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          quality: VideoQuality.HIGH,
        },
        sourceCount: 2,
        systemAudioEnabled: true,
        recordingSurface: {
          toolbarEnabled: true,
          cursorSpotlightEnabled: true,
          cursorDimmingEnabled: false,
          cursorClickAnimationEnabled: false,
        },
        webcamDeviceId: 'cam-1',
        webcamEnabled: true,
        webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation,
      },
    });
  });
}

function registerPartialVideoSettingsTests() {
  it('clamps stored source counts to the supported multi-source range', () => {
    expect(parseCurrentVideoSettings({ sourceCount: 0 }).value).toEqual({
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
      sourceCount: 1,
    });
    expect(parseCurrentVideoSettings({ sourceCount: 8 }).value).toEqual({
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
      sourceCount: 3,
    });
  });

  it('clamps stored microphone gain to the supported software range', () => {
    expect(parseCurrentVideoSettings({ microphoneGain: -1 }).value).toEqual({
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
      microphoneGain: 0,
    });
    expect(parseCurrentVideoSettings({ microphoneGain: 3 }).value).toEqual({
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
      microphoneGain: 2,
    });
  });

  it('accepts only supported drawing auto-hide delays', () => {
    expect(parseCurrentVideoSettings({ autoFadeDelay: 10 }).value).toEqual({
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
      autoFadeDelay: 10,
    });
    expect(parseCurrentVideoSettings({ autoFadeDelay: 8 })).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 1,
      value: CURRENT_VIDEO_SETTINGS_CONTRACT,
    });
  });

  it('rejects malformed recording surface and webcam presentation values independently', () => {
    expect(
      parseCurrentVideoSettings({
        recordingSurface: {
          toolbarEnabled: true,
          cursorSpotlightEnabled: false,
          cursorDimmingEnabled: false,
          cursorClickAnimationEnabled: false,
        },
        webcamPresentation: {
          ...DEFAULT_VIDEO_SETTINGS.webcamPresentation,
          center: { x: 2, y: 0.5 },
        },
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 1,
      value: {
        ...CURRENT_VIDEO_SETTINGS_CONTRACT,
        recordingSurface: {
          toolbarEnabled: true,
          cursorSpotlightEnabled: false,
          cursorDimmingEnabled: false,
          cursorClickAnimationEnabled: false,
        },
      },
    });
  });

  it('keeps partial valid settings without requiring every optional field', () => {
    expect(
      parseCurrentVideoSettings({
        microphoneEnabled: false,
        webcamDeviceId: null,
        webcamEnabled: false,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          quality: VideoQuality.LOW,
        },
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {
        ...CURRENT_VIDEO_SETTINGS_CONTRACT,
        microphoneEnabled: false,
        webcamDeviceId: null,
        webcamEnabled: false,
        outputProfile: {
          ...DEFAULT_VIDEO_SETTINGS.outputProfile,
          quality: VideoQuality.LOW,
        },
      },
    });
  });

  it('parses explicit output settings and compatible custom quality profiles', () => {
    const outputProfile = {
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
      frameRate: VideoFrameRate.FPS30,
      quality: VideoQuality.MEDIUM,
      resolution: VideoResolutionPreset.P720,
    };
    const qualityProfiles = [
      {
        id: 'custom:review',
        name: 'Review',
        configuration: outputProfile,
      },
    ];

    expect(
      parseCurrentVideoSettings({
        outputProfile,
        qualityProfileId: 'custom:review',
        qualityProfiles,
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {
        outputProfile,
        qualityProfileId: 'custom:review',
        qualityProfiles,
      },
    });
  });
}

function registerCompleteNativeSettingsTests() {
  it('parses a complete native settings snapshot and rejects partial native payloads', () => {
    const native = createCompleteNativeSettings();

    expect(parseCurrentVideoSettings({ native }).value).toEqual({
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
      native,
    });
    expect(parseCurrentVideoSettings({ native: { video: { enabled: true } } })).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 1,
      value: CURRENT_VIDEO_SETTINGS_CONTRACT,
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

    expect(parseCurrentVideoSettings({ native: legacyNative }).value).toEqual({
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
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
      parseCurrentVideoSettings({
        autoFadeDelay: '250',
        countdownSeconds: 3,
        interactionDiagnosticsEnabled: 'true',
        microphoneDeviceId: 7,
        microphoneEnabled: true,
        outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: 'BROKEN' },
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
        qualityProfileId: DEFAULT_VIDEO_SETTINGS.qualityProfileId,
        qualityProfiles: DEFAULT_VIDEO_SETTINGS.qualityProfiles,
      },
    });
  });

  it('drops incompatible output settings and malformed profile collections independently', () => {
    expect(
      parseCurrentVideoSettings({
        outputProfile: {
          codec: VideoOutputCodec.AVC,
          container: VideoOutputContainer.WEBM,
          frameRate: VideoFrameRate.FPS30,
          quality: VideoQuality.HIGH,
          resolution: VideoResolutionPreset.P1080,
        },
        qualityProfiles: [
          {
            id: 'custom:broken',
            name: '',
            configuration: { ...DEFAULT_VIDEO_SETTINGS.outputProfile },
          },
        ],
        systemAudioEnabled: false,
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 2,
      value: {
        qualityProfileId: DEFAULT_VIDEO_SETTINGS.qualityProfileId,
        systemAudioEnabled: false,
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
