import { expect, it } from 'vitest';
import { VideoMessageType } from '../messages';
import {
  isActivateVideoRecordingSurfaceMessage,
  isReleaseVideoRecordingSurfaceMessage,
  isStartSavedTabVideoRecordingMessage,
  isVideoRecordingCameraAnswerMessage,
  isVideoRecordingCameraCloseMessage,
  isVideoRecordingCameraOfferMessage,
  isVideoRecordingSurfaceCommandMessage,
  isVideoRecordingSurfaceActivation,
  isVideoRecordingSurfaceSnapshotMessage,
} from './messages.surface';
import { VideoRecordingStatus } from './types';
import { DEFAULT_VIDEO_SETTINGS } from './defaults';

const identity = {
  surfaceSessionId: 'surface-1',
  surfaceToken: 'token-1',
  documentGeneration: 2,
  peerGeneration: 3,
};

const contentIntent = { requestId: 'request-1', token: 'intent-1' };

it('validates trusted start and activation intents without accepting extra payload', () => {
  expect(
    isStartSavedTabVideoRecordingMessage({
      type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
      contentIntent,
    })
  ).toBe(true);
  expect(
    isStartSavedTabVideoRecordingMessage({
      type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
      contentIntent,
      captureMode: 'SCREEN',
    })
  ).toBe(false);
  expect(
    isActivateVideoRecordingSurfaceMessage({
      type: VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE,
      contentIntent,
    })
  ).toBe(true);
});

it('validates release, snapshot, and command authority fields narrowly', () => {
  expect(
    isReleaseVideoRecordingSurfaceMessage({
      type: VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE,
      surfaceSessionId: identity.surfaceSessionId,
      surfaceToken: identity.surfaceToken,
    })
  ).toBe(true);

  const snapshot = {
    autoFadeDelay: 5,
    surfaceSessionId: identity.surfaceSessionId,
    documentGeneration: identity.documentGeneration,
    lifecycle: 'ready',
    recordingId: 'recording-1',
    entry: 'popup',
    toolbarRequested: true,
    capabilityEpoch: 4,
    cursorSpotlightEnabled: true,
    peerGeneration: identity.peerGeneration,
    status: VideoRecordingStatus.RECORDING,
    duration: 12,
    microphoneEnabled: true,
    microphoneDeviceId: 'microphone-1',
    webcamEnabled: true,
    webcamDeviceId: 'camera-1',
    webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation,
    errorCode: null,
  };
  expect(
    isVideoRecordingSurfaceSnapshotMessage({
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
      snapshot,
    })
  ).toBe(true);
  expect(
    isVideoRecordingSurfaceActivation({
      surfaceSessionId: identity.surfaceSessionId,
      surfaceToken: identity.surfaceToken,
      snapshot,
    })
  ).toBe(true);
  expect(
    isVideoRecordingSurfaceActivation({
      surfaceSessionId: 'different-surface',
      surfaceToken: identity.surfaceToken,
      snapshot,
    })
  ).toBe(false);
  expect(
    isVideoRecordingSurfaceSnapshotMessage({
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
      snapshot: { ...snapshot, capabilityEpoch: -1 },
    })
  ).toBe(false);

  const command = {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: identity.surfaceSessionId,
    surfaceToken: identity.surfaceToken,
    documentGeneration: identity.documentGeneration,
    capabilityEpoch: 4,
    recordingId: 'recording-1',
    command: { kind: 'pause' },
  };
  expect(isVideoRecordingSurfaceCommandMessage(command)).toBe(true);
  expect(
    isVideoRecordingSurfaceCommandMessage({
      ...command,
      command: { kind: 'set-auto-fade-delay', delay: 5 },
    })
  ).toBe(true);
  expect(
    isVideoRecordingSurfaceCommandMessage({
      ...command,
      command: {
        kind: 'set-spotlight-settings',
        cursorHaloEnabled: true,
        cursorDimmingEnabled: false,
        clickAnimationEnabled: true,
      },
    })
  ).toBe(true);
  expect(
    isVideoRecordingSurfaceCommandMessage({
      ...command,
      command: { kind: 'list-media-devices', deviceKind: 'audioinput' },
    })
  ).toBe(true);
  expect(
    isVideoRecordingSurfaceCommandMessage({
      ...command,
      command: { kind: 'list-media-devices' },
    })
  ).toBe(false);
  expect(
    isVideoRecordingSurfaceCommandMessage({
      ...command,
      command: { kind: 'update-embedded-camera', appearance: { shape: 'circle' } },
    })
  ).toBe(false);
});

it('binds camera signaling messages to the surface and peer generations', () => {
  expect(
    isVideoRecordingCameraOfferMessage({
      type: VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER,
      ...identity,
      sdp: 'offer-sdp',
    })
  ).toBe(true);
  expect(
    isVideoRecordingCameraAnswerMessage({
      type: VideoMessageType.VIDEO_RECORDING_CAMERA_ANSWER,
      ...identity,
      sdp: 'answer-sdp',
    })
  ).toBe(true);
  expect(
    isVideoRecordingCameraCloseMessage({
      type: VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE,
      ...identity,
    })
  ).toBe(true);
  expect(
    isVideoRecordingCameraOfferMessage({
      type: VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER,
      ...identity,
      peerGeneration: -1,
      sdp: 'offer-sdp',
    })
  ).toBe(false);
});
