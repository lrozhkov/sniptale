import { beforeEach, expect, it, vi } from 'vitest';

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
import {
  VideoExportFormat,
  VideoProjectExportPhase,
} from '../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoRuntimeMessage } from './router';

type SendResponse = Parameters<typeof routeVideoRuntimeMessage>[1];
type RoutedVideoRuntimeMessage = Parameters<typeof routeVideoRuntimeMessage>[0];

beforeEach(() => {
  vi.clearAllMocks();
  const handledRoute = { handled: true, keepChannelOpen: false };
  handleRecordingStateMock.mockReturnValue(handledRoute);
  handleRecordingTabIdMock.mockReturnValue(handledRoute);
  handleRecordingDurationUpdatedMock.mockReturnValue(handledRoute);
  handleOffscreenRecordingStartedMock.mockReturnValue(handledRoute);
  handleOffscreenRecordingStoppedMock.mockReturnValue(handledRoute);
  handleOffscreenRecordingPausedMock.mockReturnValue(handledRoute);
  handleOffscreenRecordingResumedMock.mockReturnValue(handledRoute);
  handleOffscreenErrorMock.mockReturnValue(handledRoute);
  handleVideoSavedToIdbMock.mockReturnValue(handledRoute);
  handleDownloadRecordingMock.mockReturnValue(handledRoute);
  handleDownloadRecordingSidecarMock.mockReturnValue(handledRoute);
  handleInternalVideoSignalMock.mockReturnValue({ handled: true, keepChannelOpen: false });
  handleProjectExportLifecycleMessageMock.mockReturnValue({
    handled: true,
    keepChannelOpen: false,
  });
  createUnhandledRouteResultMock.mockReturnValue({ handled: false, keepChannelOpen: false });
});

function createMalformedVideoRuntimeMessage(): RoutedVideoRuntimeMessage {
  return JSON.parse('{"type":"UNKNOWN"}') as RoutedVideoRuntimeMessage;
}

function verifyInternalSignalBranches(sendResponse: SendResponse) {
  expect(
    routeVideoRuntimeMessage({ type: VideoMessageType.CAPTURE_SOURCE_OBTAINED }, sendResponse)
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(
    routeVideoRuntimeMessage(
      {
        type: VideoMessageType.DESKTOP_MEDIA_OBTAINED,
        desktopMediaRequestGeneration: 'generation-1',
        desktopMediaRequestId: 'request-1',
        label: 'Screen',
      },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(
    routeVideoRuntimeMessage(
      {
        type: VideoMessageType.DESKTOP_MEDIA_CANCELLED,
        desktopMediaRequestGeneration: 'generation-1',
        desktopMediaRequestId: 'request-1',
      },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(
    routeVideoRuntimeMessage(
      {
        type: VideoMessageType.DESKTOP_MEDIA_FAILED,
        desktopMediaRequestGeneration: 'generation-1',
        desktopMediaRequestId: 'request-1',
        error: 'getUserMedia failed',
        phase: 'desktop-stream-acquire',
      },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });
  expect(handleInternalVideoSignalMock).toHaveBeenCalledTimes(4);
}

function verifyProjectExportLifecycleBranches(sendResponse: SendResponse) {
  const messages = createProjectExportLifecycleMessages();
  messages.forEach((message) => {
    expect(routeVideoRuntimeMessage(message, sendResponse)).toEqual({
      handled: true,
      keepChannelOpen: false,
    });
  });
  expect(handleProjectExportLifecycleMessageMock).toHaveBeenCalledTimes(4);
  messages.forEach((message, index) => {
    expect(handleProjectExportLifecycleMessageMock).toHaveBeenNthCalledWith(
      index + 1,
      expect.objectContaining({ type: message.type }),
      sendResponse
    );
  });
}

function createProjectExportLifecycleMessages(): RoutedVideoRuntimeMessage[] {
  return [
    {
      type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
      jobId: 'job-1',
      status: {
        message: 'Rendering',
        phase: VideoProjectExportPhase.RENDERING,
        progress: 50,
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
    { type: VideoMessageType.PROJECT_EXPORT_FAILED, jobId: 'job-1', error: 'boom' },
    { type: VideoMessageType.PROJECT_EXPORT_CANCELLED, jobId: 'job-1' },
  ];
}

function createRecordingRouteMessages(): RoutedVideoRuntimeMessage[] {
  return [
    { type: VideoMessageType.GET_RECORDING_STATE },
    { type: VideoMessageType.GET_RECORDING_TAB_ID },
    { duration: 3, recordingId: 'recording-1', type: VideoMessageType.RECORDING_DURATION_UPDATED },
    { recordingId: 'recording-1', type: VideoMessageType.OFFSCREEN_RECORDING_STARTED },
    { recordingId: 'recording-1', type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED },
    { recordingId: 'recording-1', type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED },
    { recordingId: 'recording-1', type: VideoMessageType.OFFSCREEN_RECORDING_RESUMED },
    { error: 'boom', phase: 'runtime', type: VideoMessageType.OFFSCREEN_ERROR },
    { recordingId: 'recording-1', type: VideoMessageType.VIDEO_SAVED_TO_IDB },
    {
      filename: 'recording.webm',
      recordingId: 'recording-1',
      type: VideoMessageType.DOWNLOAD_RECORDING,
    },
    {
      content: 'sidecar',
      filename: 'recording.json',
      mimeType: 'application/json',
      type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
    },
  ];
}

function verifyRecordingRouteBranches(sendResponse: SendResponse) {
  const messages = createRecordingRouteMessages();
  for (const message of messages) {
    expect(routeVideoRuntimeMessage(message, sendResponse, 7)).toEqual({
      handled: true,
      keepChannelOpen: false,
    });
  }

  expect(handleRecordingStateMock).toHaveBeenCalledOnce();
  expect(handleRecordingTabIdMock).toHaveBeenCalledOnce();
  expect(handleRecordingDurationUpdatedMock).toHaveBeenCalledOnce();
  expect(handleOffscreenRecordingStartedMock).toHaveBeenCalledOnce();
  expect(handleOffscreenRecordingStoppedMock).toHaveBeenCalledOnce();
  expect(handleOffscreenRecordingPausedMock).toHaveBeenCalledOnce();
  expect(handleOffscreenRecordingResumedMock).toHaveBeenCalledOnce();
  expect(handleOffscreenErrorMock).toHaveBeenCalledOnce();
  expect(handleVideoSavedToIdbMock).toHaveBeenCalledOnce();
  expect(handleDownloadRecordingMock).toHaveBeenCalledOnce();
  expect(handleDownloadRecordingSidecarMock).toHaveBeenCalledOnce();
}

it('routes internal signal branches and project export lifecycle branches through grouped handlers', () => {
  const sendResponse: SendResponse = vi.fn();

  verifyInternalSignalBranches(sendResponse);
  verifyProjectExportLifecycleBranches(sendResponse);
});

it('routes recording runtime message branches through grouped handlers', () => {
  verifyRecordingRouteBranches(vi.fn());
});

it('returns the unhandled route result for malformed runtime messages', () => {
  expect(routeVideoRuntimeMessage(createMalformedVideoRuntimeMessage(), vi.fn())).toEqual({
    handled: false,
    keepChannelOpen: false,
  });
  expect(createUnhandledRouteResultMock).toHaveBeenCalledTimes(1);
});
