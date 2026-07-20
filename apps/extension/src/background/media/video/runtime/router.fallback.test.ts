import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createUnhandledRouteResultMock,
  handleCancelProjectExportMock,
  handleDownloadRecordingMock,
  handleDownloadRecordingSidecarMock,
  handleGetProjectExportCapabilitiesMock,
  handleInternalVideoSignalMock,
  handleOffscreenErrorMock,
  handleOffscreenReadyMock,
  handleOffscreenRecordingPausedMock,
  handleOffscreenRecordingResumedMock,
  handleOffscreenRecordingStartedMock,
  handleOffscreenRecordingStoppedMock,
  handleProjectExportLifecycleMessageMock,
  handleRecordingDurationUpdatedMock,
  handleRecordingStateMock,
  handleRecordingTabIdMock,
  handleStartProjectExportMock,
  handleVideoSavedToIdbMock,
} = vi.hoisted(() => ({
  createUnhandledRouteResultMock: vi.fn(),
  handleCancelProjectExportMock: vi.fn(),
  handleDownloadRecordingMock: vi.fn(),
  handleDownloadRecordingSidecarMock: vi.fn(),
  handleGetProjectExportCapabilitiesMock: vi.fn(),
  handleInternalVideoSignalMock: vi.fn(),
  handleOffscreenErrorMock: vi.fn(),
  handleOffscreenReadyMock: vi.fn(),
  handleOffscreenRecordingPausedMock: vi.fn(),
  handleOffscreenRecordingResumedMock: vi.fn(),
  handleOffscreenRecordingStartedMock: vi.fn(),
  handleOffscreenRecordingStoppedMock: vi.fn(),
  handleProjectExportLifecycleMessageMock: vi.fn(),
  handleRecordingDurationUpdatedMock: vi.fn(),
  handleRecordingStateMock: vi.fn(),
  handleRecordingTabIdMock: vi.fn(),
  handleStartProjectExportMock: vi.fn(),
  handleVideoSavedToIdbMock: vi.fn(),
}));

vi.mock('./handlers', () => ({
  RouteResult: undefined,
  createUnhandledRouteResult: createUnhandledRouteResultMock,
  handleDownloadRecording: handleDownloadRecordingMock,
  handleDownloadRecordingSidecar: handleDownloadRecordingSidecarMock,
  handleOffscreenError: handleOffscreenErrorMock,
  handleOffscreenRecordingPaused: handleOffscreenRecordingPausedMock,
  handleOffscreenRecordingResumed: handleOffscreenRecordingResumedMock,
  handleOffscreenRecordingStarted: handleOffscreenRecordingStartedMock,
  handleOffscreenRecordingStopped: handleOffscreenRecordingStoppedMock,
  handleRecordingDurationUpdated: handleRecordingDurationUpdatedMock,
  handleRecordingState: handleRecordingStateMock,
  handleRecordingTabId: handleRecordingTabIdMock,
  handleVideoSavedToIdb: handleVideoSavedToIdbMock,
}));
vi.mock('./handlers/export/project-export', () => ({
  handleCancelProjectExport: handleCancelProjectExportMock,
  handleGetProjectExportCapabilities: handleGetProjectExportCapabilitiesMock,
  handleStartProjectExport: handleStartProjectExportMock,
}));
vi.mock('./handlers/state/offscreen-lifecycle', () => ({
  createUnhandledRouteResult: createUnhandledRouteResultMock,
  handleInternalVideoSignal: handleInternalVideoSignalMock,
  handleOffscreenError: handleOffscreenErrorMock,
  handleOffscreenReady: handleOffscreenReadyMock,
  handleProjectExportLifecycleMessage: handleProjectExportLifecycleMessageMock,
  handleVideoSavedToIdb: handleVideoSavedToIdbMock,
}));
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import {
  VideoExportFormat,
  VideoProjectExportPhase,
} from '../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { routeVideoRuntimeMessage } from './router';

function asRuntimeMessage(message: VideoRuntimeMessage): VideoRuntimeMessage {
  return message;
}

function createMalformedRuntimeMessage(): VideoRuntimeMessage {
  return JSON.parse('{"type":"UNKNOWN"}') as VideoRuntimeMessage;
}

function createSendResponse(): ResponseSender {
  return vi.fn<(response?: unknown) => void>();
}

function resetFallbackMocks() {
  vi.clearAllMocks();
  handleProjectExportLifecycleMessageMock.mockReturnValue({
    handled: true,
    keepChannelOpen: false,
  });
  handleInternalVideoSignalMock.mockReturnValue({ handled: true, keepChannelOpen: false });
  createUnhandledRouteResultMock.mockReturnValue({ handled: false, keepChannelOpen: false });
}

function verifiesInternalSignalRoutes(sendResponse: ResponseSender) {
  routeVideoRuntimeMessage(
    asRuntimeMessage({ type: VideoMessageType.CAPTURE_SOURCE_OBTAINED }),
    sendResponse
  );
  routeVideoRuntimeMessage(
    asRuntimeMessage({
      type: VideoMessageType.DESKTOP_MEDIA_OBTAINED,
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
      label: 'Screen 1',
    }),
    sendResponse
  );
  routeVideoRuntimeMessage(
    asRuntimeMessage({
      type: VideoMessageType.DESKTOP_MEDIA_CANCELLED,
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
    }),
    sendResponse
  );
  routeVideoRuntimeMessage(
    asRuntimeMessage({
      type: VideoMessageType.DESKTOP_MEDIA_FAILED,
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
      error: 'getUserMedia failed',
      phase: 'desktop-stream-acquire',
    }),
    sendResponse
  );
  expect(handleInternalVideoSignalMock).toHaveBeenCalledTimes(4);
  expect(handleInternalVideoSignalMock).toHaveBeenNthCalledWith(1, sendResponse);
  expect(handleInternalVideoSignalMock).toHaveBeenNthCalledWith(2, sendResponse);
  expect(handleInternalVideoSignalMock).toHaveBeenNthCalledWith(3, sendResponse);
  expect(handleInternalVideoSignalMock).toHaveBeenNthCalledWith(4, sendResponse);
}

function verifiesProjectExportLifecycleRoutes(sendResponse: ResponseSender) {
  const messages = createProjectExportLifecycleMessages();
  messages.forEach((message) => routeVideoRuntimeMessage(asRuntimeMessage(message), sendResponse));
  expect(handleProjectExportLifecycleMessageMock).toHaveBeenCalledTimes(4);
  messages.forEach((message, index) => {
    expect(handleProjectExportLifecycleMessageMock).toHaveBeenNthCalledWith(
      index + 1,
      expect.objectContaining({ type: message.type }),
      sendResponse
    );
  });
}

function createProjectExportLifecycleMessages() {
  return [
    {
      type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
      jobId: 'job-1',
      status: {
        phase: VideoProjectExportPhase.RENDERING,
        progress: 50,
        message: 'Rendering',
      },
    },
    {
      type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
      jobId: 'job-1',
      projectId: 'project-1',
      recordingId: 'recording-1',
      exportId: 'export-1',
      filename: 'project.mp4',
      format: VideoExportFormat.MP4,
    },
    { type: VideoMessageType.PROJECT_EXPORT_FAILED, jobId: 'job-1', error: 'failed' },
    { type: VideoMessageType.PROJECT_EXPORT_CANCELLED, jobId: 'job-1' },
  ];
}

function verifiesFallbackRoute(sendResponse: ResponseSender) {
  expect(routeVideoRuntimeMessage(createMalformedRuntimeMessage(), sendResponse)).toEqual({
    handled: false,
    keepChannelOpen: false,
  });
  expect(createUnhandledRouteResultMock).toHaveBeenCalledTimes(1);
}

function verifiesGroupedSignalRoutesAndFallback() {
  const sendResponse = createSendResponse();

  verifiesInternalSignalRoutes(sendResponse);
  verifiesProjectExportLifecycleRoutes(sendResponse);
  verifiesFallbackRoute(sendResponse);
}

describe('video-runtime-router fallback routes', () => {
  beforeEach(resetFallbackMocks);

  it(
    'groups internal signals, export lifecycle messages, and fallback routing',
    verifiesGroupedSignalRoutesAndFallback
  );
});
