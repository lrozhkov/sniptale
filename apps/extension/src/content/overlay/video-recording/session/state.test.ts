import { expect, it } from 'vitest';
import {
  INITIAL_VIDEO_RECORDING_TOOLBAR_STATE,
  isVideoRecordingToolbarModeLocked,
  reduceVideoRecordingToolbarState,
} from './state';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

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
  expect(isVideoRecordingToolbarModeLocked(paused.phase)).toBe(true);
});

it('projects every local toolbar action without weakening lifecycle guards', () => {
  let state = reduceVideoRecordingToolbarState(INITIAL_VIDEO_RECORDING_TOOLBAR_STATE, {
    type: 'surface-ready',
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

it('locks only active recording lifecycle phases', () => {
  expect((['idle', 'error'] as const).map(isVideoRecordingToolbarModeLocked)).toEqual([
    false,
    false,
  ]);
  expect(
    (['starting', 'recording', 'paused', 'stopping'] as const).map(
      isVideoRecordingToolbarModeLocked
    )
  ).toEqual([true, true, true, true]);
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
    durationSeconds: 0,
    interaction: 'navigation',
    phase: 'idle',
    recordingId: null,
  });
});
