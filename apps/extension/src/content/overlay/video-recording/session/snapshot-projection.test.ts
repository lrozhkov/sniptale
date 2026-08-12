import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { projectVideoRecordingSurfaceSnapshot } from './snapshot-projection';

it('projects paused state only after establishing its recording identity', () => {
  const dispatch = vi.fn();
  projectVideoRecordingSurfaceSnapshot(
    {
      autoFadeDelay: 5,
      capabilityEpoch: 1,
      cursorSpotlightEnabled: true,
      documentGeneration: 0,
      duration: 8,
      entry: 'popup',
      errorCode: null,
      lifecycle: 'ready',
      microphoneDeviceId: null,
      microphoneEnabled: true,
      peerGeneration: 0,
      recordingId: 'recording-1',
      status: VideoRecordingStatus.PAUSED,
      surfaceSessionId: 'surface-1',
      toolbarRequested: true,
      webcamDeviceId: null,
      webcamEnabled: true,
      webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
    },
    'token-1',
    dispatch
  );

  expect(dispatch).toHaveBeenCalledWith({ type: 'recording', recordingId: 'recording-1' });
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'paused' });
});

const baseSnapshot = {
  autoFadeDelay: 5 as const,
  capabilityEpoch: 1,
  cursorSpotlightEnabled: true,
  documentGeneration: 0,
  duration: 8,
  entry: 'popup' as const,
  errorCode: null,
  lifecycle: 'ready' as const,
  microphoneDeviceId: null,
  microphoneEnabled: true,
  peerGeneration: 0,
  recordingId: 'recording-1',
  surfaceSessionId: 'surface-1',
  toolbarRequested: true,
  webcamDeviceId: null,
  webcamEnabled: true,
  webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
};

it.each([
  [VideoRecordingStatus.IDLE, { type: 'idle' }],
  [VideoRecordingStatus.PREPARING, { type: 'starting', recordingId: 'recording-1' }],
  [VideoRecordingStatus.COUNTDOWN, { type: 'starting', recordingId: 'recording-1' }],
  [VideoRecordingStatus.RECORDING, { type: 'recording', recordingId: 'recording-1' }],
  [VideoRecordingStatus.STOPPING, { type: 'stopping' }],
] as const)('projects %s lifecycle snapshots', (status, expected) => {
  const dispatch = vi.fn();
  projectVideoRecordingSurfaceSnapshot({ ...baseSnapshot, status }, 'token-1', dispatch);
  expect(dispatch).toHaveBeenLastCalledWith(expected);
});

it('projects idle errors and tolerates recording snapshots without an identity', () => {
  const dispatch = vi.fn();
  projectVideoRecordingSurfaceSnapshot(
    { ...baseSnapshot, status: VideoRecordingStatus.IDLE, errorCode: 'capture failed' },
    'token-1',
    dispatch
  );
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'failed', error: 'capture failed' });
  dispatch.mockClear();
  projectVideoRecordingSurfaceSnapshot(
    { ...baseSnapshot, status: VideoRecordingStatus.RECORDING, recordingId: null },
    'token-1',
    dispatch
  );
  expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'recording' }));
});
