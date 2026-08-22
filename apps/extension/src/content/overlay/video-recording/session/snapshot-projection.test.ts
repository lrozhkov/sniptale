import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { projectVideoRecordingSurfaceSnapshot } from './snapshot-projection';

it('projects each snapshot through one atomic reducer action', () => {
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

  expect(dispatch).toHaveBeenCalledOnce();
  expect(dispatch).toHaveBeenCalledWith({
    type: 'snapshot',
    snapshot: expect.objectContaining({
      recordingId: 'recording-1',
      status: VideoRecordingStatus.PAUSED,
    }),
    surfaceToken: 'token-1',
    error: null,
  });
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
  VideoRecordingStatus.IDLE,
  VideoRecordingStatus.PREPARING,
  VideoRecordingStatus.COUNTDOWN,
  VideoRecordingStatus.RECORDING,
  VideoRecordingStatus.STOPPING,
])('projects %s lifecycle snapshots atomically', (status) => {
  const dispatch = vi.fn();
  const snapshot = { ...baseSnapshot, status };
  projectVideoRecordingSurfaceSnapshot(snapshot, 'token-1', dispatch);
  expect(dispatch).toHaveBeenCalledOnce();
  expect(dispatch).toHaveBeenCalledWith({
    type: 'snapshot',
    snapshot,
    surfaceToken: 'token-1',
    error: null,
  });
});

it('localizes the camera frame-rate failure code for the toolbar', () => {
  const dispatch = vi.fn();
  projectVideoRecordingSurfaceSnapshot(
    {
      ...baseSnapshot,
      status: VideoRecordingStatus.IDLE,
      errorCode: 'camera-frame-rate-unsupported',
    },
    'token-1',
    dispatch
  );
  expect(dispatch).toHaveBeenCalledOnce();
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'snapshot',
      error: 'Камера не поддерживает выбранную частоту кадров. Выберите другую частоту.',
    })
  );
});
