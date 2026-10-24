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
  isRecordingMediaPermissionBootstrap,
  isRecordingMediaPermissionResult,
  isRecordingMediaPermissionCancellation,
  isWebcamPresentationSettings,
} from './messages.surface';
import {
  VideoRecordingStatus,
  DEFAULT_VIDEO_CURSOR_EFFECTS,
  isVideoCursorEffectSettings,
  WEBCAM_DOCK_POSITIONS,
} from './types';
import { DEFAULT_VIDEO_SETTINGS } from './defaults';

const identity = {
  surfaceSessionId: 'surface-1',
  surfaceToken: 'token-1',
  documentGeneration: 2,
  peerGeneration: 3,
};

const contentIntent = { requestId: 'request-1', token: 'intent-1' };

it.each([0, 1, 2, -0.01, 2.01, NaN, Infinity, '1', null])('bounds microphone gain %s', (gain) => {
  const message = {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    ...identity,
    capabilityEpoch: 1,
    recordingId: null,
    command: { kind: 'set-microphone-gain', gain },
  };
  const { peerGeneration: _peer, ...request } = message;
  expect(isVideoRecordingSurfaceCommandMessage(request)).toBe(
    typeof gain === 'number' && Number.isFinite(gain) && gain >= 0 && gain <= 2
  );
  expect(
    isVideoRecordingSurfaceCommandMessage({
      ...request,
      command: { ...request.command, extra: true },
    })
  ).toBe(false);
});

it.each(['circle', 'rectangle', 'soft', 'ellipse', 'square'])(
  'admits bounded %s appearance in camera commands',
  (shape) => {
    const presentation = {
      ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
      shape,
      appearance: { roundness: 80, zoom: 3, mirror: true, shadow: true, shadowColor: '#abcdef' },
    };
    expect(isWebcamPresentationSettings(presentation)).toBe(true);
    const { mode: _mode, ...geometry } = presentation;
    const message = {
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
      surfaceSessionId: identity.surfaceSessionId,
      surfaceToken: identity.surfaceToken,
      documentGeneration: 2,
      capabilityEpoch: 4,
      recordingId: null,
      command: { kind: 'update-embedded-camera', appearance: geometry },
    };
    expect(isVideoRecordingSurfaceCommandMessage(message)).toBe(true);
    expect(
      isVideoRecordingSurfaceCommandMessage({
        ...message,
        command: { ...message.command, appearance: { ...geometry, mode: 'embedded' } },
      })
    ).toBe(false);
    for (const invalid of [
      { zoom: NaN },
      { zoom: 0 },
      { roundness: 101 },
      { mirror: 'yes' },
      { shadow: null },
      { shadowColor: '#fff' },
      { shadowColor: 'url(https://example.com)' },
      { extra: true },
    ]) {
      const appearance = { ...presentation.appearance, ...invalid };
      expect(isWebcamPresentationSettings({ ...presentation, appearance })).toBe(false);
      expect(
        isVideoRecordingSurfaceCommandMessage({
          ...message,
          command: { ...message.command, appearance: { ...geometry, appearance } },
        })
      ).toBe(false);
    }
  }
);

it('validates old and new embedded camera placement commands', () => {
  const presentation = DEFAULT_VIDEO_SETTINGS.webcamPresentation!;
  const geometry = {
    shape: presentation.shape,
    center: presentation.center,
    sizeFraction: presentation.sizeFraction,
    cropOffset: presentation.cropOffset,
  };
  const command = (freePlacement: unknown, dockPosition?: unknown) => ({
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: identity.surfaceSessionId,
    surfaceToken: identity.surfaceToken,
    documentGeneration: identity.documentGeneration,
    capabilityEpoch: 4,
    recordingId: null,
    command: {
      kind: 'update-embedded-camera',
      appearance: {
        ...geometry,
        ...(freePlacement === undefined ? {} : { freePlacement }),
        ...(dockPosition === undefined ? {} : { dockPosition }),
      },
    },
  });
  for (const value of [undefined, false, true])
    expect(isVideoRecordingSurfaceCommandMessage(command(value))).toBe(true);
  for (const value of [null, 'true', 1])
    expect(isVideoRecordingSurfaceCommandMessage(command(value))).toBe(false);
  for (const dockPosition of WEBCAM_DOCK_POSITIONS)
    expect(isVideoRecordingSurfaceCommandMessage(command(false, dockPosition))).toBe(true);
  for (const dockPosition of [null, 'center', 1])
    expect(isVideoRecordingSurfaceCommandMessage(command(false, dockPosition))).toBe(false);
});

it('validates additive live click modes and contour fields without accepting unbounded styles', () => {
  for (const clickEffect of ['ripple', 'press', 'glow']) {
    expect(
      isVideoCursorEffectSettings({
        ...DEFAULT_VIDEO_CURSOR_EFFECTS,
        clickEffect,
        clickStroke: 8,
        clickPulses: 5,
        clickEasing: 'linear',
        haloStroke: 0.5,
        haloGlow: 0,
      })
    ).toBe(true);
  }
  for (const patch of [
    { clickEffect: 'url(x)' },
    { clickEffect: null },
    { clickEasing: 'steps(99)' },
    { clickStroke: Infinity },
    { clickStroke: 0 },
    { clickPulses: 1.5 },
    { clickPulses: 6 },
    { haloStroke: -1 },
    { haloGlow: 41 },
    { unexpected: true },
  ])
    expect(isVideoCursorEffectSettings({ ...DEFAULT_VIDEO_CURSOR_EFFECTS, ...patch })).toBe(false);
});

it('admits bounded cursor appearance only inside the existing spotlight command', () => {
  const cursorEffects = {
    haloSize: 48,
    haloOpacity: 70,
    dimmingRadius: 90,
    dimmingOpacity: 45,
    clickSize: 60,
    clickDuration: 650,
    haloColor: '#2563eb',
    dimmingColor: '#112233',
    clickColor: '#ef4444',
  };
  const message = {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: identity.surfaceSessionId,
    surfaceToken: identity.surfaceToken,
    documentGeneration: identity.documentGeneration,
    capabilityEpoch: 4,
    recordingId: null,
    command: {
      kind: 'set-spotlight-settings',
      cursorHaloEnabled: true,
      cursorDimmingEnabled: true,
      clickAnimationEnabled: true,
      cursorEffects,
    },
  };
  expect(isVideoRecordingSurfaceCommandMessage(message)).toBe(true);
  for (const haloColor of ['#2563eb80', '#2563eb00']) {
    expect(
      isVideoRecordingSurfaceCommandMessage({
        ...message,
        command: { ...message.command, cursorEffects: { ...cursorEffects, haloColor } },
      })
    ).toBe(true);
  }
  for (const haloColor of ['#12345', '#1234567', '#123456789', 'rgba(1,2,3,0.5)', 'url(x)']) {
    expect(
      isVideoRecordingSurfaceCommandMessage({
        ...message,
        command: { ...message.command, cursorEffects: { ...cursorEffects, haloColor } },
      })
    ).toBe(false);
  }
  for (const invalid of [null, {}, [], { ...cursorEffects, clickDuration: 1201 }]) {
    expect(
      isVideoRecordingSurfaceCommandMessage({
        ...message,
        command: { ...message.command, cursorEffects: invalid },
      })
    ).toBe(false);
  }
});

it('accepts only the bounded private permission protocol and read-only authority request', () => {
  const request = {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    documentGeneration: 1,
    capabilityEpoch: 1,
    recordingId: null,
    command: { kind: 'list-media-devices', deviceKind: 'audioinput', requestPermission: false },
  };
  const bootstrap = { type: 'recording-media-permission', request, locale: 'en', theme: 'dark' };
  expect(isRecordingMediaPermissionBootstrap(bootstrap)).toBe(true);
  for (const command of [
    { kind: 'set-microphone-enabled', enabled: true },
    { kind: 'list-media-devices', deviceKind: 'audioinput' },
    { kind: 'list-media-devices', deviceKind: 'audioinput', requestPermission: true },
  ]) {
    expect(
      isRecordingMediaPermissionBootstrap({ ...bootstrap, request: { ...request, command } })
    ).toBe(false);
  }
  expect(isRecordingMediaPermissionBootstrap({ ...bootstrap, locale: 'fr' })).toBe(false);
  expect(isRecordingMediaPermissionBootstrap({ ...bootstrap, extra: true })).toBe(false);
  expect(
    isRecordingMediaPermissionBootstrap({ ...bootstrap, request: { ...request, surfaceToken: '' } })
  ).toBe(false);
  for (const status of ['ready', 'granted', 'cancelled']) {
    expect(isRecordingMediaPermissionResult({ status })).toBe(true);
    expect(isRecordingMediaPermissionResult({ status, token: 'forged' })).toBe(false);
  }
  expect(isRecordingMediaPermissionResult({ status: 'failed', reason: 'policy' })).toBe(true);
  expect(isRecordingMediaPermissionResult({ status: 'failed', reason: 'arbitrary' })).toBe(false);
  expect(isRecordingMediaPermissionCancellation({ type: 'cancel' })).toBe(true);
  expect(isRecordingMediaPermissionCancellation({ type: 'cancel', source: 'page' })).toBe(false);
});

it('validates explicit microphone confirmation flags without allowing forged settings', () => {
  const message = {
    type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
    contentIntent,
    confirmedWithoutMicrophone: true,
    rememberWithoutMicrophone: false,
  };
  expect(isStartSavedTabVideoRecordingMessage(message)).toBe(true);
  expect(
    isStartSavedTabVideoRecordingMessage({ ...message, confirmedWithoutMicrophone: 'true' })
  ).toBe(false);
  expect(isStartSavedTabVideoRecordingMessage({ ...message, rememberWithoutMicrophone: 1 })).toBe(
    false
  );
  expect(isStartSavedTabVideoRecordingMessage({ ...message, settings: {} })).toBe(false);
});

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

it('admits only the two camera placement modes with an exact command shape', () => {
  const message = {
    surfaceSessionId: identity.surfaceSessionId,
    surfaceToken: identity.surfaceToken,
    documentGeneration: identity.documentGeneration,
    capabilityEpoch: 4,
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    recordingId: null,
  };
  for (const mode of ['embedded', 'separate-track']) {
    expect(
      isVideoRecordingSurfaceCommandMessage({
        ...message,
        command: { kind: 'set-webcam-presentation-mode', mode },
      })
    ).toBe(true);
  }
  for (const command of [
    { kind: 'set-webcam-presentation-mode', mode: 'screen' },
    { kind: 'set-webcam-presentation-mode', mode: null },
    { kind: 'set-webcam-presentation-mode', mode: 'embedded', enabled: true },
    { kind: 'set-webcam-presentation-mode' },
  ])
    expect(isVideoRecordingSurfaceCommandMessage({ ...message, command })).toBe(false);
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
  const outputSettings = {
    outputProfile: DEFAULT_VIDEO_SETTINGS.outputProfile,
    qualityProfileId: 'builtin:optimal',
    qualityProfiles: [
      { id: 'custom:one', name: 'One', configuration: DEFAULT_VIDEO_SETTINGS.outputProfile },
    ],
  };
  const configured = {
    ...snapshot,
    outputSettings,
    captureMode: 'TAB_CROP',
    cropRegion: { x: 0, y: 0, width: 400, height: 240 },
  };
  expect(
    isVideoRecordingSurfaceSnapshotMessage({
      type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
      snapshot: configured,
    })
  ).toBe(true);
  for (const change of [
    { outputSettings: { outputProfile: outputSettings.outputProfile } },
    { outputSettings: { ...outputSettings, qualityProfiles: undefined } },
    { outputSettings: { ...outputSettings, qualityProfileId: undefined } },
    { outputSettings: { ...outputSettings, unexpected: true } },
    { outputSettings: { ...outputSettings, qualityProfiles: [{}] } },
    {
      outputSettings: {
        ...outputSettings,
        outputProfile: { ...outputSettings.outputProfile, extra: true },
      },
    },
    { captureMode: 'PAGE' },
    { cropRegion: { x: -1, y: 0, width: 400, height: 240 } },
    { cropRegion: { x: 0, y: 0, width: 0, height: 240 } },
    { cropRegion: { x: 0, y: 0, width: 400, height: Infinity } },
  ])
    expect(
      isVideoRecordingSurfaceSnapshotMessage({
        type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
        snapshot: { ...configured, ...change },
      })
    ).toBe(false);
  for (const freePlacement of [true, false, 'true', null]) {
    expect(
      isVideoRecordingSurfaceSnapshotMessage({
        type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
        snapshot: {
          ...snapshot,
          webcamPresentation: { ...snapshot.webcamPresentation, freePlacement },
        },
      })
    ).toBe(typeof freePlacement === 'boolean');
  }
  for (const microphoneGain of [0, 1, 2, -1, 3, NaN, Infinity, '1', null]) {
    expect(
      isVideoRecordingSurfaceSnapshotMessage({
        type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
        snapshot: { ...snapshot, microphoneGain },
      })
    ).toBe(
      typeof microphoneGain === 'number' &&
        Number.isFinite(microphoneGain) &&
        microphoneGain >= 0 &&
        microphoneGain <= 2
    );
  }
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

it('admits only page capture targets in trusted saved start options', () => {
  const message = { type: VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING, contentIntent };
  for (const captureMode of ['TAB', 'TAB_CROP'])
    expect(isStartSavedTabVideoRecordingMessage({ ...message, captureMode })).toBe(true);
  for (const captureMode of ['SCREEN', 'CAMERA', '', null, 1])
    expect(isStartSavedTabVideoRecordingMessage({ ...message, captureMode })).toBe(false);
});

it('admits bounded profile selection and exact canonical output payloads', () => {
  const message = {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: identity.surfaceSessionId,
    surfaceToken: identity.surfaceToken,
    documentGeneration: 2,
    capabilityEpoch: 4,
    recordingId: null,
  };
  expect(
    isVideoRecordingSurfaceCommandMessage({
      ...message,
      command: { kind: 'select-quality-profile', profileId: 'builtin:compact' },
    })
  ).toBe(true);
  for (const profileId of ['', 'x'.repeat(129), null, 1])
    expect(
      isVideoRecordingSurfaceCommandMessage({
        ...message,
        command: { kind: 'select-quality-profile', profileId },
      })
    ).toBe(false);
  const command = {
    kind: 'set-output-profile',
    outputProfile: DEFAULT_VIDEO_SETTINGS.outputProfile,
  };
  expect(isVideoRecordingSurfaceCommandMessage({ ...message, command })).toBe(true);
  expect(
    isVideoRecordingSurfaceCommandMessage({ ...message, command: { ...command, extra: true } })
  ).toBe(false);
  for (const outputProfile of [
    { ...command.outputProfile, extra: true },
    { ...command.outputProfile, frameRate: NaN },
    { ...command.outputProfile, codec: 'H264', container: 'WEBM' },
    null,
  ])
    expect(
      isVideoRecordingSurfaceCommandMessage({ ...message, command: { ...command, outputProfile } })
    ).toBe(false);
});
