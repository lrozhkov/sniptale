import { beforeEach, expect, it, vi } from 'vitest';

const {
  handleOffscreenRecordingPausedMock,
  handleOffscreenRecordingResumedMock,
  handleOffscreenRecordingStartedMock,
  handleOffscreenRecordingStoppedMock,
} = vi.hoisted(() => ({
  handleOffscreenRecordingPausedMock: vi.fn(),
  handleOffscreenRecordingResumedMock: vi.fn(),
  handleOffscreenRecordingStartedMock: vi.fn(),
  handleOffscreenRecordingStoppedMock: vi.fn(),
}));

vi.mock('./handlers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./handlers')>();
  return {
    ...actual,
    handleOffscreenRecordingPaused: handleOffscreenRecordingPausedMock,
    handleOffscreenRecordingResumed: handleOffscreenRecordingResumedMock,
    handleOffscreenRecordingStarted: handleOffscreenRecordingStartedMock,
    handleOffscreenRecordingStopped: handleOffscreenRecordingStoppedMock,
  };
});
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoRuntimeMessage } from './router';

const createSendResponse = () => vi.fn();
const createRouteResult = (label: string) => ({ handled: true, keepChannelOpen: false, label });
const asRuntimeMessage = (message: VideoRuntimeMessage): VideoRuntimeMessage => message;

beforeEach(() => {
  vi.clearAllMocks();
  handleOffscreenRecordingStartedMock.mockReturnValue(createRouteResult('started'));
  handleOffscreenRecordingStoppedMock.mockReturnValue(createRouteResult('stopped'));
  handleOffscreenRecordingPausedMock.mockReturnValue(createRouteResult('paused'));
  handleOffscreenRecordingResumedMock.mockReturnValue(createRouteResult('resumed'));
});

it('routes offscreen started and stopped messages with their session ids', () => {
  const sendResponse = createSendResponse();
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
        recordingId: 'rec-1',
        cursorCaptureMode: 'embedded-fallback',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('started'));
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
        recordingId: 'rec-1',
        filename: 'clip.webm',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('stopped'));
  expect(handleOffscreenRecordingStartedMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
      recordingId: 'rec-1',
      cursorCaptureMode: 'embedded-fallback',
    },
    sendResponse
  );
  expect(handleOffscreenRecordingStoppedMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
      recordingId: 'rec-1',
      filename: 'clip.webm',
    },
    sendResponse
  );
});

it('routes offscreen pause and resume messages with their session ids', () => {
  const sendResponse = createSendResponse();
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({ type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED, recordingId: 'rec-1' }),
      sendResponse
    )
  ).toEqual(createRouteResult('paused'));
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
        recordingId: 'rec-1',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('resumed'));
  expect(handleOffscreenRecordingPausedMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
      recordingId: 'rec-1',
    },
    sendResponse
  );
  expect(handleOffscreenRecordingResumedMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
      recordingId: 'rec-1',
    },
    sendResponse
  );
});
