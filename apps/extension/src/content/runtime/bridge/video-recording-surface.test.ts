import { expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const { receiveVideoRecordingRuntimeState, receiveVideoRecordingSurfaceSnapshot } = vi.hoisted(
  () => ({
    receiveVideoRecordingRuntimeState: vi.fn(),
    receiveVideoRecordingSurfaceSnapshot: vi.fn(),
  })
);

vi.mock('../../overlay/video-recording/transport/snapshot-channel', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../overlay/video-recording/transport/snapshot-channel')
  >()),
  receiveVideoRecordingRuntimeState,
  receiveVideoRecordingSurfaceSnapshot,
}));

import { handleVideoRecordingSurfaceSnapshotMessage } from './video-recording-surface';

it('buffers the recording surface snapshot and acknowledges the tab contract', () => {
  const message = {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
    snapshot: {
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
    },
    surfaceToken: 'token-1',
  };
  const sendResponse = vi.fn();

  expect(handleVideoRecordingSurfaceSnapshotMessage(message, sendResponse)).toBe(false);
  expect(receiveVideoRecordingSurfaceSnapshot).toHaveBeenCalledWith(message);
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
});

it('acknowledges recording lifecycle sync for the controller subscription', () => {
  const sendResponse = vi.fn();
  expect(
    handleVideoRecordingSurfaceSnapshotMessage(
      {
        type: VideoMessageType.RECORDING_STATE_SYNC,
        state: {
          captureMode: null,
          captureSource: null,
          countdownEndsAt: null,
          duration: 12,
          error: null,
          liveMedia: null,
          status: VideoRecordingStatus.RECORDING,
          viewportPresetId: null,
        },
      },
      sendResponse
    )
  ).toBe(false);
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
  expect(receiveVideoRecordingRuntimeState).toHaveBeenCalledWith(
    expect.objectContaining({ status: VideoRecordingStatus.RECORDING })
  );
});
