import { expect, it } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

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

it('parses the controlled cursor capture flag and rejects invalid values', () => {
  expect(
    parseCurrentVideoSettings({
      controlledCursorCaptureEnabled: true,
      microphoneEnabled: false,
      webcamDeviceId: null,
      webcamEnabled: false,
    })
  ).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 0,
    value: {
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
      controlledCursorCaptureEnabled: true,
      microphoneEnabled: false,
      webcamDeviceId: null,
      webcamEnabled: false,
    },
  });
  expect(
    parseCurrentVideoSettings({
      controlledCursorCaptureEnabled: 'yes',
      microphoneEnabled: false,
      webcamDeviceId: null,
      webcamEnabled: false,
    })
  ).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 1,
    value: {
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
      microphoneEnabled: false,
      webcamDeviceId: null,
      webcamEnabled: false,
    },
  });
});

it('keeps valid string and numeric settings while counting invalid field variants', () => {
  expect(
    parseCurrentVideoSettings({
      autoFadeDelay: 300,
      countdownSeconds: '3',
      controlledCursorCaptureEnabled: false,
      diagnosticsEnabled: false,
      microphoneDeviceId: 'mic-1',
      openEditorAfterRecording: true,
    })
  ).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 1,
    value: {
      ...CURRENT_VIDEO_SETTINGS_CONTRACT,
      autoFadeDelay: 300,
      controlledCursorCaptureEnabled: false,
      diagnosticsEnabled: false,
      microphoneDeviceId: 'mic-1',
      openEditorAfterRecording: true,
    },
  });
});

it('preserves empty ui state roots and mixed valid ui state fields', () => {
  expect(parseStoredVideoUiState({})).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 0,
    value: {},
  });
  expect(
    parseStoredVideoUiState({
      captureMode: 'TAB',
      viewportPresetId: 'preset-1',
    })
  ).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 0,
    value: {
      captureMode: 'TAB',
      viewportPresetId: 'preset-1',
    },
  });
});
