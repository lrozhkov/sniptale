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
  handleProjectExportLifecycleMessageMock: vi.fn(),
  handleRecordingDurationUpdatedMock: vi.fn(),
  handleRecordingStateMock: vi.fn(),
  handleRecordingTabIdMock: vi.fn(),
  handleStartProjectExportMock: vi.fn(),
  handleVideoSavedToIdbMock: vi.fn(),
}));

vi.mock('./handlers/export/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers/export/download')>()),
  handleDownloadRecording: handleDownloadRecordingMock,
  handleDownloadRecordingSidecar: handleDownloadRecordingSidecarMock,
}));
vi.mock('./handlers/state/recording-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers/state/recording-state')>()),
  handleRecordingDurationUpdated: handleRecordingDurationUpdatedMock,
  handleRecordingTabId: handleRecordingTabIdMock,
}));
vi.mock('./handlers/state/recording-state-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers/state/recording-state-response')>()),
  handleRecordingState: handleRecordingStateMock,
}));
vi.mock('./handlers/export/project-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers/export/project-export')>()),
  handleCancelProjectExport: handleCancelProjectExportMock,
  handleGetProjectExportCapabilities: handleGetProjectExportCapabilitiesMock,
  handleStartProjectExport: handleStartProjectExportMock,
}));
vi.mock('./handlers/state/offscreen-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers/state/offscreen-lifecycle')>()),
  createUnhandledRouteResult: createUnhandledRouteResultMock,
  handleInternalVideoSignal: handleInternalVideoSignalMock,
  handleOffscreenError: handleOffscreenErrorMock,
  handleOffscreenReady: handleOffscreenReadyMock,
  handleProjectExportLifecycleMessage: handleProjectExportLifecycleMessageMock,
  handleVideoSavedToIdb: handleVideoSavedToIdbMock,
}));
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoRuntimeMessage } from './router';

const createSendResponse = () => vi.fn();
const createRouteResult = (label: string) => ({
  handled: true,
  keepChannelOpen: label.includes('async'),
});
const asRuntimeMessage = (message: VideoRuntimeMessage): VideoRuntimeMessage => message;

function resetVideoRuntimeRouterMocks() {
  vi.clearAllMocks();
  handleRecordingStateMock.mockReturnValue(createRouteResult('recording-state'));
  handleRecordingDurationUpdatedMock.mockReturnValue(createRouteResult('recording-duration'));
  handleOffscreenErrorMock.mockReturnValue(createRouteResult('error'));
  handleVideoSavedToIdbMock.mockReturnValue(createRouteResult('saved'));
  handleDownloadRecordingMock.mockReturnValue(createRouteResult('download-async'));
  handleDownloadRecordingSidecarMock.mockReturnValue(createRouteResult('sidecar-async'));
  handleStartProjectExportMock.mockReturnValue(createRouteResult('start-export-async'));
  handleCancelProjectExportMock.mockReturnValue(createRouteResult('cancel-export-async'));
  handleGetProjectExportCapabilitiesMock.mockReturnValue(
    createRouteResult('get-export-capabilities-async')
  );
  handleOffscreenReadyMock.mockReturnValue(createRouteResult('offscreen-ready'));
  handleInternalVideoSignalMock.mockReturnValue(createRouteResult('internal'));
  handleProjectExportLifecycleMessageMock.mockReturnValue(createRouteResult('lifecycle'));
  createUnhandledRouteResultMock.mockReturnValue({ handled: false, keepChannelOpen: false });
  handleRecordingTabIdMock.mockReturnValue(createRouteResult('recording-tab-id'));
}

function verifiesRecordingStateRoutes(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(
    routeVideoRuntimeMessage({ type: VideoMessageType.GET_RECORDING_STATE }, sendResponse)
  ).toEqual(createRouteResult('recording-state'));
  expect(handleRecordingStateMock).toHaveBeenCalledWith(sendResponse, undefined);
  expect(
    routeVideoRuntimeMessage({ type: VideoMessageType.GET_RECORDING_TAB_ID }, sendResponse, 33)
  ).toEqual(createRouteResult('recording-tab-id'));
  expect(handleRecordingTabIdMock).toHaveBeenCalledWith(sendResponse, 33);
  expect(
    routeVideoRuntimeMessage(
      { type: VideoMessageType.RECORDING_DURATION_UPDATED, duration: 12, recordingId: 'rec-1' },
      sendResponse
    )
  ).toEqual(createRouteResult('recording-duration'));
  expect(handleRecordingDurationUpdatedMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.RECORDING_DURATION_UPDATED,
      duration: 12,
      recordingId: 'rec-1',
    },
    sendResponse
  );
}

function verifiesDirectHandlerRoutes() {
  const sendResponse = createSendResponse();
  verifiesRecordingStateRoutes(sendResponse);
}

function verifiesOffscreenErrorRoute(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.OFFSCREEN_ERROR,
        error: 'boom',
        phase: 'start',
        recordingId: 'rec-1',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('error'));
  expect(handleOffscreenErrorMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.OFFSCREEN_ERROR,
      error: 'boom',
      phase: 'start',
      recordingId: 'rec-1',
    },
    sendResponse
  );
}

function verifiesSavedAndDownloadRoutes(sendResponse: ReturnType<typeof createSendResponse>) {
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.VIDEO_SAVED_TO_IDB,
        primaryRecordingId: 'rec-1',
        recordingId: 'rec-1',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('saved'));
  expect(handleVideoSavedToIdbMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.VIDEO_SAVED_TO_IDB,
      primaryRecordingId: 'rec-1',
      recordingId: 'rec-1',
    },
    sendResponse
  );
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.DOWNLOAD_RECORDING,
        recordingId: 'rec-1',
        filename: 'clip.webm',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('download-async'));
  expect(handleDownloadRecordingMock).toHaveBeenCalledWith(
    { type: VideoMessageType.DOWNLOAD_RECORDING, recordingId: 'rec-1', filename: 'clip.webm' },
    sendResponse
  );

  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
        content: 'WEBVTT',
        filename: 'clip.vtt',
        mimeType: 'text/vtt',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('sidecar-async'));
  expect(handleDownloadRecordingSidecarMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
      content: 'WEBVTT',
      filename: 'clip.vtt',
      mimeType: 'text/vtt',
    },
    sendResponse
  );
}

function verifiesMessagePayloadRoutes() {
  const sendResponse = createSendResponse();

  verifiesOffscreenErrorRoute(sendResponse);
  verifiesSavedAndDownloadRoutes(sendResponse);
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({ type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' }),
      sendResponse
    )
  ).toEqual(createRouteResult('offscreen-ready'));
  expect(handleOffscreenReadyMock).toHaveBeenCalledWith(
    { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' },
    sendResponse
  );
}

function verifiesGroupedFallbackRoutes(sendResponse: ReturnType<typeof createSendResponse>) {
  const failedMessage = asRuntimeMessage({
    type: VideoMessageType.DESKTOP_MEDIA_FAILED,
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
    error: 'getUserMedia failed',
    phase: 'desktop-stream-acquire',
  });

  expect(routeVideoRuntimeMessage(failedMessage, sendResponse)).toEqual(
    createRouteResult('internal')
  );
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.PROJECT_EXPORT_CANCELLED,
        jobId: 'job-1',
      }),
      sendResponse
    )
  ).toEqual(createRouteResult('lifecycle'));
}

beforeEach(resetVideoRuntimeRouterMocks);
it('routes direct recording state messages to the matching handlers', verifiesDirectHandlerRoutes);
it('routes payload runtime messages', verifiesMessagePayloadRoutes);
it('covers grouped fallback switch branches', () => {
  const sendResponse = createSendResponse();

  verifiesGroupedFallbackRoutes(sendResponse);
});
