import { expect, it, vi } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { VideoRecordingSurfaceLease } from './surface-lease';

const mocks = vi.hoisted(() => ({ runtimeState: vi.fn() }));

vi.mock('../runtime/session-state', () => ({
  getVideoRecordingRuntimeState: mocks.runtimeState,
}));

import { createVideoRecordingSurfaceSnapshot } from './snapshot';

const lease: VideoRecordingSurfaceLease = {
  capabilityEpoch: 1,
  documentGeneration: 1,
  entry: 'manual',
  expiresAt: Date.now() + 60_000,
  lifecycle: 'ready',
  peerGeneration: 1,
  recordingId: null,
  surfaceSessionId: 'surface-preview',
  surfaceToken: 'surface-token',
  tabId: 12,
  toolbarRequested: true,
};

it.each([
  VideoRecordingStatus.PREPARING,
  VideoRecordingStatus.COUNTDOWN,
  VideoRecordingStatus.RECORDING,
  VideoRecordingStatus.PAUSED,
  VideoRecordingStatus.STOPPING,
  VideoRecordingStatus.IDLE,
])('keeps idle camera preview settings independent of an unrelated %s recording', (status) => {
  const liveMedia = {
    microphoneEnabled: false,
    microphoneDeviceId: 'recording-mic',
    microphoneSelected: false,
    webcamEnabled: false,
    webcamDeviceId: 'recording-camera',
    webcamSelected: false,
  };
  mocks.runtimeState.mockReturnValue({
    status,
    duration: 43,
    error: 'unrelated failure',
    liveMedia,
  });
  const settings = {
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: true,
    microphoneDeviceId: 'preview-mic',
    webcamEnabled: true,
    webcamDeviceId: 'preview-camera',
  };
  expect(createVideoRecordingSurfaceSnapshot(lease, settings)).toMatchObject({
    recordingId: null,
    status: VideoRecordingStatus.IDLE,
    duration: 0,
    errorCode: null,
    microphoneEnabled: true,
    microphoneDeviceId: 'preview-mic',
    webcamEnabled: true,
    webcamDeviceId: 'preview-camera',
  });
  expect(
    createVideoRecordingSurfaceSnapshot({ ...lease, recordingId: 'recording-1' }, settings)
  ).toMatchObject({
    recordingId: 'recording-1',
    status,
    duration: 43,
    errorCode: 'unrelated failure',
    microphoneEnabled: false,
    microphoneDeviceId: 'recording-mic',
    webcamEnabled: false,
    webcamDeviceId: 'recording-camera',
  });
});

it('projects saved output setup and only the owned recording capture geometry', () => {
  const cropRegion = { x: 80, y: 40, width: 400, height: 240 };
  mocks.runtimeState.mockReturnValue({
    status: VideoRecordingStatus.RECORDING,
    captureMode: 'TAB_CROP',
    cropRegion,
    duration: 7,
    error: null,
  });
  const idle = createVideoRecordingSurfaceSnapshot(lease, DEFAULT_VIDEO_SETTINGS);
  expect(idle).toMatchObject({
    captureMode: null,
    cropRegion: null,
    outputSettings: { outputProfile: DEFAULT_VIDEO_SETTINGS.outputProfile },
  });
  const active = createVideoRecordingSurfaceSnapshot(
    { ...lease, recordingId: 'recording-1' },
    DEFAULT_VIDEO_SETTINGS
  );
  expect(active).toMatchObject({ captureMode: 'TAB_CROP', cropRegion });
});
