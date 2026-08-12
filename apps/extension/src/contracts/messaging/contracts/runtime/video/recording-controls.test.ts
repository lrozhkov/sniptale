import { expect, it } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoSessionMessageContracts } from './session';

const controlCapability = {
  controlToken: 'control-token-1',
  recordingId: 'recording-1',
};

const recordingSettings = {
  ...DEFAULT_VIDEO_SETTINGS,
  countdownSeconds: 0,
  autoFadeDelay: 3,
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

it('rejects legacy recording settings on start requests', () => {
  const contract = runtimeVideoSessionMessageContracts[VideoMessageType.START_RECORDING];

  for (const settings of [
    { ...recordingSettings, quality: 'HIGH' },
    { ...recordingSettings, output: {} },
  ]) {
    expect(() =>
      contract.parseRequest({
        type: VideoMessageType.START_RECORDING,
        settings,
        tabId: 1,
        captureMode: CaptureMode.TAB,
      })
    ).toThrow(/START_RECORDING/);
  }
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

it('accepts canonical successful content-surface command and release results', () => {
  expect(
    runtimeVideoSessionMessageContracts[
      VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND
    ].parseResponse({
      success: true,
      result: { result: 'accepted' },
    })
  ).toEqual({ success: true, result: { result: 'accepted' } });
  expect(
    runtimeVideoSessionMessageContracts[
      VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE
    ].parseResponse({ success: true, result: 'released' })
  ).toEqual({ success: true, result: 'released' });
  expect(
    runtimeVideoSessionMessageContracts[
      VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE
    ].parseResponse({ success: true, result: 'closed' })
  ).toEqual({ success: true, result: 'closed' });
});

it('validates kind-specific offscreen media-device catalog messages', () => {
  const contract =
    runtimeVideoSessionMessageContracts[VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES];
  expect(
    contract.parseRequest({
      capabilityToken: 'offscreen-capability',
      deviceKind: 'videoinput',
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES,
    })
  ).toEqual({
    capabilityToken: 'offscreen-capability',
    deviceKind: 'videoinput',
    type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES,
  });
  expect(
    contract.parseResponse({
      success: true,
      mediaDevices: [{ deviceId: 'camera-a', kind: 'videoinput', label: '' }],
    })
  ).toEqual({
    success: true,
    mediaDevices: [{ deviceId: 'camera-a', kind: 'videoinput', label: '' }],
  });
  expect(() =>
    contract.parseRequest({
      capabilityToken: 'offscreen-capability',
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES,
    })
  ).toThrow(/MEDIA_DEVICES/);
});

it('registers launch tokens and accepts only tokenless same-tab reconnect requests', () => {
  expect(
    runtimeVideoSessionMessageContracts[
      VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL
    ].parseRequest({
      type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
      cameraRegistrationToken: 'launch-token-1',
      recordingId: 'recording-1',
    })
  ).toEqual({
    type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
    cameraRegistrationToken: 'launch-token-1',
    recordingId: 'recording-1',
  });

  expect(
    runtimeVideoSessionMessageContracts[
      VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL
    ].parseResponse({
      success: true,
      recordingId: 'recording-1',
      controlToken: 'control-token-1',
      result: 'active',
    })
  ).toEqual({
    success: true,
    recordingId: 'recording-1',
    controlToken: 'control-token-1',
    result: 'active',
  });
  expect(() =>
    runtimeVideoSessionMessageContracts[
      VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL
    ].parseResponse({
      success: true,
      recordingId: 'recording-1',
      result: 'invented-state',
    })
  ).toThrow(/REGISTER_CAMERA_RECORDER_CONTROL/);

  expect(
    runtimeVideoSessionMessageContracts[
      VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL
    ].parseRequest({ type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL })
  ).toEqual({ type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL });

  expect(() =>
    runtimeVideoSessionMessageContracts[
      VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL
    ].parseRequest({
      type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
      cameraRegistrationToken: 'launch-token-1',
    })
  ).toThrow(/REGISTER_CAMERA_RECORDER_CONTROL/);

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

it('validates the complete persisted post-record result in recording-state responses', () => {
  const parseResponse =
    runtimeVideoSessionMessageContracts[VideoMessageType.GET_RECORDING_STATE].parseResponse;
  const baseResult = {
    primaryRecordingId: 'recording-1-window-1',
    projectId: null,
    recordingId: 'recording-1',
  };

  expect(parseResponse({ success: true, postRecordResult: baseResult })).toEqual({
    success: true,
    postRecordResult: baseResult,
  });
  expect(
    parseResponse({
      success: true,
      postRecordResult: { ...baseResult, projectId: 'project-1' },
    })
  ).toEqual({
    success: true,
    postRecordResult: { ...baseResult, projectId: 'project-1' },
  });

  for (const postRecordResult of [
    'recording-1',
    { ...baseResult, primaryRecordingId: null },
    { ...baseResult, primaryRecordingId: '' },
    { ...baseResult, projectId: 1 },
    { ...baseResult, projectId: '' },
    { ...baseResult, recordingId: null },
    { ...baseResult, recordingId: '' },
  ]) {
    expect(() => parseResponse({ success: true, postRecordResult })).toThrow(/GET_RECORDING_STATE/);
  }
});

it('requires an exact recording group when acknowledging a post-record result', () => {
  const contract =
    runtimeVideoSessionMessageContracts[VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT];

  expect(
    contract.parseRequest({
      type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
      recordingId: 'recording-1',
    })
  ).toEqual({
    type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
    recordingId: 'recording-1',
  });
  expect(() =>
    contract.parseRequest({ type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT })
  ).toThrow(/ACKNOWLEDGE_POST_RECORD_RESULT/);
  expect(() =>
    contract.parseRequest({
      type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
      recordingId: '',
    })
  ).toThrow(/ACKNOWLEDGE_POST_RECORD_RESULT/);
  expect(contract.parseResponse({ success: true, result: 'acknowledged' })).toEqual({
    success: true,
    result: 'acknowledged',
  });
  expect(() => contract.parseResponse({ success: true, result: 'invented-state' })).toThrow(
    /ACKNOWLEDGE_POST_RECORD_RESULT/
  );
});
