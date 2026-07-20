import { expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoSessionMessageContracts } from './session';

const controlCapability = {
  controlToken: 'control-token-1',
  recordingId: 'recording-1',
};

const recordingSettings = {
  microphoneEnabled: false,
  microphoneDeviceId: null,
  webcamEnabled: false,
  webcamDeviceId: null,
  systemAudioEnabled: true,
  quality: 'HIGH',
  countdownSeconds: 0,
  autoFadeDelay: 1,
  openEditorAfterRecording: true,
  diagnosticsEnabled: false,
};

it('rejects unknown capture modes on start recording requests', () => {
  expect(
    runtimeVideoSessionMessageContracts[VideoMessageType.START_RECORDING].parseRequest({
      type: VideoMessageType.START_RECORDING,
      settings: recordingSettings,
      tabId: 1,
      captureMode: CaptureMode.SCREEN,
    })
  ).toEqual({
    type: VideoMessageType.START_RECORDING,
    settings: recordingSettings,
    tabId: 1,
    captureMode: CaptureMode.SCREEN,
  });

  expect(() =>
    runtimeVideoSessionMessageContracts[VideoMessageType.START_RECORDING].parseRequest({
      type: VideoMessageType.START_RECORDING,
      settings: recordingSettings,
      tabId: 1,
      captureMode: 'region',
    })
  ).toThrow(/START_RECORDING/);
});

it('allows camera recording start requests without a tab id', () => {
  expect(
    runtimeVideoSessionMessageContracts[VideoMessageType.START_RECORDING].parseRequest({
      type: VideoMessageType.START_RECORDING,
      settings: recordingSettings,
      captureMode: CaptureMode.CAMERA,
    })
  ).toEqual({
    type: VideoMessageType.START_RECORDING,
    settings: recordingSettings,
    captureMode: CaptureMode.CAMERA,
  });
});

it('rejects non-camera start recording requests without a tab id', () => {
  expect(() =>
    runtimeVideoSessionMessageContracts[VideoMessageType.START_RECORDING].parseRequest({
      type: VideoMessageType.START_RECORDING,
      settings: recordingSettings,
      captureMode: CaptureMode.TAB,
    })
  ).toThrow(/START_RECORDING/);
});

it('requires recording control capabilities for active recording controls', () => {
  expect(
    runtimeVideoSessionMessageContracts[VideoMessageType.STOP_RECORDING].parseRequest({
      type: VideoMessageType.STOP_RECORDING,
      discard: true,
      ...controlCapability,
    })
  ).toEqual({
    type: VideoMessageType.STOP_RECORDING,
    discard: true,
    ...controlCapability,
  });

  expect(
    runtimeVideoSessionMessageContracts[VideoMessageType.PAUSE_RECORDING].parseRequest({
      type: VideoMessageType.PAUSE_RECORDING,
      ...controlCapability,
    })
  ).toEqual({
    type: VideoMessageType.PAUSE_RECORDING,
    ...controlCapability,
  });

  expect(() =>
    runtimeVideoSessionMessageContracts[VideoMessageType.STOP_RECORDING].parseRequest({
      type: VideoMessageType.STOP_RECORDING,
      discard: true,
    })
  ).toThrow(/STOP_RECORDING/);

  expect(() =>
    runtimeVideoSessionMessageContracts[VideoMessageType.RESUME_RECORDING].parseRequest({
      type: VideoMessageType.RESUME_RECORDING,
      controlToken: 'control-token-1',
    })
  ).toThrow(/RESUME_RECORDING/);
});

it('parses start cancellation separately from capability-bound recording controls', () => {
  expect(
    runtimeVideoSessionMessageContracts[VideoMessageType.CANCEL_RECORDING_START].parseRequest({
      type: VideoMessageType.CANCEL_RECORDING_START,
      ...controlCapability,
    })
  ).toEqual({
    type: VideoMessageType.CANCEL_RECORDING_START,
    ...controlCapability,
  });

  expect(() =>
    runtimeVideoSessionMessageContracts[VideoMessageType.CANCEL_RECORDING_START].parseRequest({
      type: VideoMessageType.CANCEL_RECORDING_START,
    })
  ).toThrow(/CANCEL_RECORDING_START/);

  expect(() =>
    runtimeVideoSessionMessageContracts[VideoMessageType.UPDATE_SETTINGS].parseRequest({
      type: VideoMessageType.UPDATE_SETTINGS,
      settings: { microphoneEnabled: false },
    })
  ).toThrow(/UPDATE_SETTINGS/);

  expect(
    runtimeVideoSessionMessageContracts[VideoMessageType.UPDATE_SETTINGS].parseRequest({
      type: VideoMessageType.UPDATE_SETTINGS,
      ...controlCapability,
      settings: { microphoneEnabled: false, webcamEnabled: true },
    })
  ).toEqual({
    type: VideoMessageType.UPDATE_SETTINGS,
    ...controlCapability,
    settings: { microphoneEnabled: false, webcamEnabled: true },
  });
});

it('allows start recording responses to carry the recording control capability', () => {
  expect(
    runtimeVideoSessionMessageContracts[VideoMessageType.START_RECORDING].parseResponse({
      success: true,
      result: 'accepted',
      recordingId: 'recording-1',
      controlToken: 'control-token-1',
      cameraLaunchToken: 'launch-token-1',
    })
  ).toEqual({
    success: true,
    result: 'accepted',
    recordingId: 'recording-1',
    controlToken: 'control-token-1',
    cameraLaunchToken: 'launch-token-1',
  });
});

it('registers camera recorder controls through an explicit launch-token route', () => {
  expect(
    runtimeVideoSessionMessageContracts[
      VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL
    ].parseRequest({
      type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
      cameraLaunchToken: 'launch-token-1',
      recordingId: 'recording-1',
    })
  ).toEqual({
    type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
    cameraLaunchToken: 'launch-token-1',
    recordingId: 'recording-1',
  });

  expect(
    runtimeVideoSessionMessageContracts[
      VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL
    ].parseResponse({
      success: true,
      recordingId: 'recording-1',
      controlToken: 'control-token-1',
    })
  ).toEqual({
    success: true,
    recordingId: 'recording-1',
    controlToken: 'control-token-1',
  });

  expect(() =>
    runtimeVideoSessionMessageContracts[
      VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL
    ].parseRequest({
      type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
      recordingId: 'recording-1',
    })
  ).toThrow(/REGISTER_CAMERA_RECORDER_CONTROL/);

  expect(() =>
    runtimeVideoSessionMessageContracts[VideoMessageType.GET_RECORDING_STATE].parseRequest({
      type: VideoMessageType.GET_RECORDING_STATE,
      cameraLaunchToken: 'launch-token-1',
      recordingId: 'recording-1',
    })
  ).toThrow(/GET_RECORDING_STATE/);
});

it('allows recording lifecycle async routes to acknowledge accepted updates', () => {
  expect(
    runtimeVideoSessionMessageContracts[VideoMessageType.RECORDING_DURATION_UPDATED].parseResponse({
      success: true,
      result: 'accepted',
    })
  ).toEqual({
    success: true,
    result: 'accepted',
  });
});
