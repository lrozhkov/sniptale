import { expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const {
  prepareVideoRecordingCapture,
  receiveVideoRecordingRuntimeState,
  receiveVideoRecordingSurfaceSnapshot,
} = vi.hoisted(() => ({
  prepareVideoRecordingCapture: vi.fn(),
  receiveVideoRecordingRuntimeState: vi.fn(),
  receiveVideoRecordingSurfaceSnapshot: vi.fn(),
}));

vi.mock('../../overlay/video-recording/transport/snapshot-channel', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../overlay/video-recording/transport/snapshot-channel')
  >()),
  prepareVideoRecordingCapture,
  receiveVideoRecordingRuntimeState,
  receiveVideoRecordingSurfaceSnapshot,
}));

import { handleVideoRecordingSurfaceSnapshotMessage } from './video-recording-surface';

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

it('buffers the recording surface snapshot and acknowledges the tab contract', () => {
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

it('keeps capture acknowledgement pending until surface paint is ready', async () => {
  let ready!: () => void;
  prepareVideoRecordingCapture.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      ready = resolve;
    })
  );
  const sendResponse = vi.fn();
  expect(
    handleVideoRecordingSurfaceSnapshotMessage(
      { ...message, capturePreparation: { requestId: 'paint-1', suppressed: true } },
      sendResponse
    )
  ).toBe(true);
  expect(sendResponse).not.toHaveBeenCalled();
  ready();
  await Promise.resolve();
  expect(sendResponse).toHaveBeenCalledWith({ success: true, capturePreparationId: 'paint-1' });
});

it('refuses admission when surface preparation fails', async () => {
  prepareVideoRecordingCapture.mockRejectedValueOnce(new Error('disposed'));
  const sendResponse = vi.fn();
  expect(
    handleVideoRecordingSurfaceSnapshotMessage(
      { ...message, capturePreparation: { requestId: 'paint-1', suppressed: true } },
      sendResponse
    )
  ).toBe(true);
  await Promise.resolve();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Recording drawing surface preparation failed',
  });
});
