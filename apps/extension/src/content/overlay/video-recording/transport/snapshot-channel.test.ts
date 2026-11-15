import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  clearVideoRecordingSurfaceSnapshot,
  prepareVideoRecordingCapture,
  subscribeToVideoRecordingCapturePreparation,
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

it('waits for the mounted drawing surface to finish capture preparation', async () => {
  let ready!: () => void;
  const preparation = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const listener = vi.fn(() => preparation);
  const unsubscribe = subscribeToVideoRecordingCapturePreparation(listener);
  let acknowledged = false;
  const request = {
    type: 'VIDEO_RECORDING_SURFACE_SNAPSHOT' as const,
    snapshot,
    surfaceToken: 'token-1',
    capturePreparation: { requestId: 'prepare-1', suppressed: true },
  };
  const pending = prepareVideoRecordingCapture(request).then(() => {
    acknowledged = true;
  });
  await Promise.resolve();
  expect(listener).toHaveBeenCalledWith(request);
  expect(acknowledged).toBe(false);
  ready();
  await pending;
  expect(acknowledged).toBe(true);
  unsubscribe();
});

it('refuses capture readiness after the surface consumer has disposed', async () => {
  const unsubscribe = subscribeToVideoRecordingCapturePreparation(async () => undefined);
  unsubscribe();
  await expect(
    prepareVideoRecordingCapture({
      type: 'VIDEO_RECORDING_SURFACE_SNAPSHOT',
      snapshot,
      surfaceToken: 'token-1',
      capturePreparation: { requestId: 'prepare-1', suppressed: true },
    })
  ).rejects.toThrow('Recording drawing surface is unavailable');
});
