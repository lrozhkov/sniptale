import { expect, it } from 'vitest';

import { parseStoredVideoSettings, parseStoredVideoUiState } from './guards';

it('parses the controlled cursor capture flag and rejects invalid values', () => {
  expect(
    parseStoredVideoSettings({
      controlledCursorCaptureEnabled: true,
      microphoneEnabled: false,
      webcamDeviceId: null,
      webcamEnabled: false,
    })
  ).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 0,
    value: {
      controlledCursorCaptureEnabled: true,
      microphoneEnabled: false,
      webcamDeviceId: null,
      webcamEnabled: false,
    },
  });
  expect(
    parseStoredVideoSettings({
      controlledCursorCaptureEnabled: 'yes',
      microphoneEnabled: false,
      webcamDeviceId: null,
      webcamEnabled: false,
    })
  ).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 1,
    value: {
      microphoneEnabled: false,
      webcamDeviceId: null,
      webcamEnabled: false,
    },
  });
});

it('keeps valid string and numeric settings while counting invalid field variants', () => {
  expect(
    parseStoredVideoSettings({
      autoFadeDelay: 300,
      countdownSeconds: '3',
      controlledCursorCaptureEnabled: false,
      diagnosticsEnabled: false,
      microphoneDeviceId: 'mic-1',
      openEditorAfterRecording: true,
      quality: 'HIGH',
    })
  ).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 1,
    value: {
      autoFadeDelay: 300,
      controlledCursorCaptureEnabled: false,
      diagnosticsEnabled: false,
      microphoneDeviceId: 'mic-1',
      openEditorAfterRecording: true,
      quality: 'HIGH',
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
