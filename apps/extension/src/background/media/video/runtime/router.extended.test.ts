import { beforeEach, expect, it, vi } from 'vitest';

const {
  createUnhandledRouteResultMock,
  appendContentDiagnosticEventMock,
  handleInternalVideoSignalMock,
  handleOffscreenRecordingPausedMock,
  handleOffscreenRecordingResumedMock,
  handleOffscreenRecordingStartedMock,
  handleOffscreenRecordingStoppedMock,
} = vi.hoisted(() => ({
  createUnhandledRouteResultMock: vi.fn(),
  appendContentDiagnosticEventMock: vi.fn(),
  handleInternalVideoSignalMock: vi.fn(),
  handleOffscreenRecordingPausedMock: vi.fn(),
  handleOffscreenRecordingResumedMock: vi.fn(),
  handleOffscreenRecordingStartedMock: vi.fn(),
  handleOffscreenRecordingStoppedMock: vi.fn(),
}));

vi.mock('../../../diagnostics/public/event-sink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../diagnostics/public/event-sink')>()),
  appendContentDiagnosticEvent: appendContentDiagnosticEventMock,
}));
vi.mock('./handlers/state/recording-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers/state/recording-state')>()),
  handleOffscreenRecordingPaused: handleOffscreenRecordingPausedMock,
  handleOffscreenRecordingResumed: handleOffscreenRecordingResumedMock,
  handleOffscreenRecordingStarted: handleOffscreenRecordingStartedMock,
  handleOffscreenRecordingStopped: handleOffscreenRecordingStoppedMock,
}));
vi.mock('./handlers/state/offscreen-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers/state/offscreen-lifecycle')>()),
  createUnhandledRouteResult: createUnhandledRouteResultMock,
  handleInternalVideoSignal: handleInternalVideoSignalMock,
}));
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoRuntimeMessage } from './router';

const asRuntimeMessage = (message: VideoRuntimeMessage): VideoRuntimeMessage => message;
const createRouteResult = (label: string) => ({ handled: true, keepChannelOpen: false, label });
const sendResponse = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  createUnhandledRouteResultMock.mockReturnValue({ handled: false, keepChannelOpen: false });
  handleInternalVideoSignalMock.mockReturnValue(createRouteResult('internal'));
  handleOffscreenRecordingStartedMock.mockReturnValue(createRouteResult('offscreen-started'));
  handleOffscreenRecordingStoppedMock.mockReturnValue(createRouteResult('offscreen-stopped'));
  handleOffscreenRecordingPausedMock.mockReturnValue(createRouteResult('offscreen-paused'));
  handleOffscreenRecordingResumedMock.mockReturnValue(createRouteResult('offscreen-resumed'));
});

it('routes offscreen recording lifecycle messages to their handlers', () => {
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
        recordingId: 'rec-1',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('offscreen-started'));
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
        recordingId: 'rec-1',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('offscreen-stopped'));
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({ type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED, recordingId: 'rec-1' }),
      sendResponse
    )
  ).toEqual(createRouteResult('offscreen-paused'));
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
        recordingId: 'rec-1',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('offscreen-resumed'));
});

it('routes internal signals, diagnostics, and unhandled messages explicitly', () => {
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.CAPTURE_SOURCE_OBTAINED,
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('internal'));
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        event: 'error:video failed',
        level: 'error',
        type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
      }),
      sendResponse,
      17
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(appendContentDiagnosticEventMock).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'error', message: 'video failed' }),
    17
  );
});
