import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  clearVideoRecordingSurfaceSnapshot,
  receiveVideoRecordingSurfaceSnapshot,
  receiveVideoRecordingRuntimeState,
  subscribeToVideoRecordingRuntimeState,
  subscribeToVideoRecordingSurfaceSnapshots,
} from './snapshot-channel';

const snapshot = {
  autoFadeDelay: 0 as const,
  capabilityEpoch: 1,
  cursorSpotlightEnabled: false,
  documentGeneration: 0,
  duration: 0,
  entry: 'popup' as const,
  errorCode: null,
  lifecycle: 'ready' as const,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  peerGeneration: 0,
  recordingId: 'recording-1',
  status: VideoRecordingStatus.RECORDING,
  surfaceSessionId: 'surface-1',
  toolbarRequested: true,
  webcamDeviceId: null,
  webcamEnabled: false,
  webcamPresentation: DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
};

it('replays a snapshot received before the React surface controller subscribes', () => {
  clearVideoRecordingSurfaceSnapshot();
  receiveVideoRecordingSurfaceSnapshot({ snapshot, surfaceToken: 'token-1' });
  const listener = vi.fn();

  const unsubscribe = subscribeToVideoRecordingSurfaceSnapshots(listener);

  expect(listener).toHaveBeenCalledWith(snapshot, 'token-1');
  unsubscribe();
  clearVideoRecordingSurfaceSnapshot();
});

it('delivers bridge-owned runtime state through the local channel', () => {
  const listener = vi.fn();
  const unsubscribe = subscribeToVideoRecordingRuntimeState(listener);
  const state = {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 9,
    error: null,
    liveMedia: null,
    status: VideoRecordingStatus.RECORDING,
    viewportPresetId: null,
  };

  receiveVideoRecordingRuntimeState(state);

  expect(listener).toHaveBeenCalledWith(state);
  unsubscribe();
});
