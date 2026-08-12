import { expect, it } from 'vitest';
import { INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, reduceVideoRecordingToolbarState } from './state';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

function snapshot(status: VideoRecordingStatus, recordingId: string | null = null) {
  return {
    autoFadeDelay: 0 as const,
    capabilityEpoch: 1,
    cursorSpotlightEnabled: false,
    documentGeneration: 0,
    duration: 5,
    entry: 'manual' as const,
    errorCode: null,
    lifecycle: 'ready' as const,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    peerGeneration: 1,
    recordingId,
    status,
    surfaceSessionId: 'surface-1',
    toolbarRequested: true,
    webcamDeviceId: null,
    webcamEnabled: true,
    webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
  };
}

it('derives the toolbar lifecycle without accepting invalid pause transitions', () => {
  const idlePaused = reduceVideoRecordingToolbarState(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, {
    type: 'paused',
  });
  expect(idlePaused).toBe(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE);

  const recording = reduceVideoRecordingToolbarState(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, {
    type: 'recording',
    recordingId: 'recording-1',
  });
  const paused = reduceVideoRecordingToolbarState(recording, { type: 'paused' });
  expect(paused.phase).toBe('paused');
  expect(paused.phase).toBe('paused');
});

it('projects every local toolbar action without weakening lifecycle guards', () => {
  let state = reduceVideoRecordingToolbarState(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, {
    type: 'surface-ready',
    peerGeneration: 4,
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
  });
  state = reduceVideoRecordingToolbarState(state, { type: 'starting', recordingId: 'recording-1' });
  state = reduceVideoRecordingToolbarState(state, {
    type: 'recording',
    recordingId: 'recording-1',
  });
  state = reduceVideoRecordingToolbarState(state, { type: 'paused' });
  state = reduceVideoRecordingToolbarState(state, { type: 'resumed' });
  state = reduceVideoRecordingToolbarState(state, { type: 'stopping' });
  state = reduceVideoRecordingToolbarState(state, { type: 'duration', durationSeconds: 9 });
  state = reduceVideoRecordingToolbarState(state, { type: 'duration', durationSeconds: 3 });
  state = reduceVideoRecordingToolbarState(state, { type: 'interaction', interaction: 'drawing' });
  state = reduceVideoRecordingToolbarState(state, { type: 'spotlight', enabled: true });
  state = reduceVideoRecordingToolbarState(state, { type: 'microphone', enabled: true });
  state = reduceVideoRecordingToolbarState(state, {
    type: 'microphone-device',
    deviceId: 'mic-1',
  });
  state = reduceVideoRecordingToolbarState(state, { type: 'camera', enabled: true });
  state = reduceVideoRecordingToolbarState(state, { type: 'camera-device', deviceId: 'cam-1' });
  state = reduceVideoRecordingToolbarState(state, {
    type: 'camera-presentation',
    presentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
  });

  expect(state).toMatchObject({
    cameraEnabled: true,
    durationSeconds: 9,
    interaction: 'drawing',
    microphoneDeviceId: 'mic-1',
    peerGeneration: 4,
    phase: 'stopping',
    spotlightEnabled: true,
    surfaceSessionId: 'surface-1',
    webcamDeviceId: 'cam-1',
  });
  expect(
    reduceVideoRecordingToolbarState(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, { type: 'resumed' })
  ).toBe(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE);
  expect(
    reduceVideoRecordingToolbarState(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, { type: 'stopping' })
  ).toBe(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE);
  expect(
    reduceVideoRecordingToolbarState(state, { type: 'failed', error: 'failed' })
  ).toMatchObject({ error: 'failed', phase: 'error', recordingId: null });
});

it('returns to navigation and clears disposable recording identity on idle', () => {
  const state = reduceVideoRecordingToolbarState(
    {
      ...INITIAL_VIDEO_RECORDING_TOOLBAR_STATE,
      durationSeconds: 12,
      interaction: 'drawing',
      phase: 'stopping',
      recordingId: 'recording-1',
    },
    { type: 'idle' }
  );
  expect(state).toMatchObject({
    cameraPreviewSuppressed: true,
    durationSeconds: 0,
    interaction: 'navigation',
    phase: 'idle',
    recordingId: null,
  });
});

it('suppresses a completed preview until a new start or explicit camera enable', () => {
  const recording = reduceVideoRecordingToolbarState(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, {
    type: 'recording',
    recordingId: 'recording-1',
  });
  const idle = reduceVideoRecordingToolbarState(recording, { type: 'idle' });
  const configured = reduceVideoRecordingToolbarState(idle, {
    type: 'camera-configured',
    enabled: true,
  });

  expect(configured.cameraEnabled).toBe(true);
  expect(configured.cameraPreviewSuppressed).toBe(true);
  expect(
    reduceVideoRecordingToolbarState(configured, { type: 'starting' }).cameraPreviewSuppressed
  ).toBe(false);
  expect(
    reduceVideoRecordingToolbarState(configured, { type: 'camera', enabled: true })
      .cameraPreviewSuppressed
  ).toBe(false);
});

it('suppresses the preview when a pending start is cancelled', () => {
  const starting = reduceVideoRecordingToolbarState(
    {
      ...INITIAL_VIDEO_RECORDING_TOOLBAR_STATE,
      cameraEnabled: true,
    },
    { type: 'starting' }
  );

  expect(reduceVideoRecordingToolbarState(starting, { type: 'idle' })).toMatchObject({
    cameraEnabled: true,
    cameraPreviewSuppressed: true,
    phase: 'idle',
  });
});

it('projects paused recording state atomically and suppresses its preview on idle', () => {
  const paused = reduceVideoRecordingToolbarState(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, {
    type: 'snapshot',
    snapshot: snapshot(VideoRecordingStatus.PAUSED, 'recording-1'),
    surfaceToken: 'token-1',
    error: null,
  });
  const idle = reduceVideoRecordingToolbarState(paused, {
    type: 'snapshot',
    snapshot: snapshot(VideoRecordingStatus.IDLE),
    surfaceToken: 'token-1',
    error: null,
  });

  expect(paused).toMatchObject({
    cameraEnabled: true,
    durationSeconds: 5,
    phase: 'paused',
    recordingId: 'recording-1',
    surfaceToken: 'token-1',
  });
  expect(idle).toMatchObject({
    cameraPreviewSuppressed: true,
    durationSeconds: 0,
    phase: 'idle',
    recordingId: null,
  });
});

it('does not carry preview suppression into a replacement surface session', () => {
  const next = reduceVideoRecordingToolbarState(
    {
      ...INITIAL_VIDEO_RECORDING_TOOLBAR_STATE,
      cameraPreviewSuppressed: true,
      phase: 'stopping',
      recordingId: 'recording-1',
      surfaceSessionId: 'surface-1',
    },
    {
      type: 'snapshot',
      snapshot: { ...snapshot(VideoRecordingStatus.IDLE), surfaceSessionId: 'surface-2' },
      surfaceToken: 'token-2',
      error: null,
    }
  );

  expect(next.cameraPreviewSuppressed).toBe(false);
  expect(next.surfaceSessionId).toBe('surface-2');
});
