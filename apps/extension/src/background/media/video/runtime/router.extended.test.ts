import { beforeEach, expect, it, vi } from 'vitest';

const {
  createUnhandledRouteResultMock,
  handleCancelProjectExportMock,
  appendContentDiagnosticEventMock,
  handleGetProjectExportCapabilitiesMock,
  handleInternalVideoSignalMock,
  handleOffscreenRecordingPausedMock,
  handleOffscreenRecordingResumedMock,
  handleOffscreenRecordingStartedMock,
  handleOffscreenRecordingStoppedMock,
  handleStartProjectExportMock,
  resolveTrustedVideoEditorRuntimeSenderMock,
} = vi.hoisted(() => ({
  createUnhandledRouteResultMock: vi.fn(),
  handleCancelProjectExportMock: vi.fn(),
  appendContentDiagnosticEventMock: vi.fn(),
  handleGetProjectExportCapabilitiesMock: vi.fn(),
  handleInternalVideoSignalMock: vi.fn(),
  handleOffscreenRecordingPausedMock: vi.fn(),
  handleOffscreenRecordingResumedMock: vi.fn(),
  handleOffscreenRecordingStartedMock: vi.fn(),
  handleOffscreenRecordingStoppedMock: vi.fn(),
  handleStartProjectExportMock: vi.fn(),
  resolveTrustedVideoEditorRuntimeSenderMock: vi.fn(),
}));

vi.mock('../../../diagnostics/public/event-sink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../diagnostics/public/event-sink')>()),
  appendContentDiagnosticEvent: appendContentDiagnosticEventMock,
}));
vi.mock('./handlers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers')>()),
  createUnhandledRouteResult: createUnhandledRouteResultMock,
  handleOffscreenRecordingPaused: handleOffscreenRecordingPausedMock,
  handleOffscreenRecordingResumed: handleOffscreenRecordingResumedMock,
  handleOffscreenRecordingStarted: handleOffscreenRecordingStartedMock,
  handleOffscreenRecordingStopped: handleOffscreenRecordingStoppedMock,
}));
vi.mock('./handlers/export/project-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers/export/project-export')>()),
  handleCancelProjectExport: handleCancelProjectExportMock,
  handleGetProjectExportCapabilities: handleGetProjectExportCapabilitiesMock,
  handleStartProjectExport: handleStartProjectExportMock,
}));
vi.mock('./handlers/state/offscreen-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handlers/state/offscreen-lifecycle')>()),
  handleInternalVideoSignal: handleInternalVideoSignalMock,
}));
vi.mock('./sender-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sender-policy')>()),
  resolveTrustedVideoEditorRuntimeSender: resolveTrustedVideoEditorRuntimeSenderMock,
}));
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { routeVideoRuntimeMessage } from './router';

const asRuntimeMessage = (message: VideoRuntimeMessage): VideoRuntimeMessage => message;
const createRouteResult = (label: string) => ({ handled: true, keepChannelOpen: false, label });
const sendResponse = vi.fn();
const sender = {
  documentId: 'editor-doc-1',
  url: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
};
const exportOwner = {
  documentId: 'editor-doc-1',
  kind: 'project-export' as const,
  senderUrl: sender.url,
};
const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const exportSettings: VideoProjectExportSettings = {
  downloadAfterExport: true,
  format: VideoExportFormat.MP4,
  fps: 30,
  height: 720,
  quality: VideoExportQualityPreset.BALANCED,
  width: 1280,
};
const videoProject: VideoProject = {
  actionEvents: [],
  assets: [],
  backgroundColor: '#000000',
  baseRecordingId: null,
  clips: [],
  createdAt: 1,
  cursorTrack: null,
  duration: 10,
  fps: 30,
  height: 720,
  id: 'project-1',
  name: 'Project',
  source: { kind: 'manual' },
  timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
  tracks: [],
  updatedAt: 1,
  version: 2,
  width: 1280,
};

beforeEach(() => {
  vi.clearAllMocks();
  createUnhandledRouteResultMock.mockReturnValue({ handled: false, keepChannelOpen: false });
  handleInternalVideoSignalMock.mockReturnValue(createRouteResult('internal'));
  handleOffscreenRecordingStartedMock.mockReturnValue(createRouteResult('offscreen-started'));
  handleOffscreenRecordingStoppedMock.mockReturnValue(createRouteResult('offscreen-stopped'));
  handleOffscreenRecordingPausedMock.mockReturnValue(createRouteResult('offscreen-paused'));
  handleOffscreenRecordingResumedMock.mockReturnValue(createRouteResult('offscreen-resumed'));
  handleStartProjectExportMock.mockReturnValue(createRouteResult('start-export'));
  handleCancelProjectExportMock.mockReturnValue(createRouteResult('cancel-export'));
  handleGetProjectExportCapabilitiesMock.mockReturnValue(createRouteResult('export-capabilities'));
  resolveTrustedVideoEditorRuntimeSenderMock.mockReturnValue(exportOwner);
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

it('routes start project export messages through sender-bound capabilities', async () => {
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        capabilityToken: 'start-token',
        jobId: 'job-1',
        input: {
          contentSha256: `sha256:${'a'.repeat(64)}`,
          jobId: 'job-1',
          projectId: videoProject.id,
          retainedByteLength: 3 * 1024 * 1024,
        },
        settings: exportSettings,
        type: VideoMessageType.START_PROJECT_EXPORT,
      }),
      sendResponse,
      undefined,
      sender,
      exportOwner
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushPromises();
  expect(handleStartProjectExportMock).toHaveBeenCalledWith(
    expect.objectContaining({ jobId: 'job-1' }),
    sendResponse,
    exportOwner
  );
});

it('routes cancel project export messages through sender-bound capabilities', async () => {
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        capabilityToken: 'cancel-token',
        jobId: 'job-1',
        type: VideoMessageType.CANCEL_PROJECT_EXPORT,
      }),
      sendResponse,
      undefined,
      sender,
      exportOwner
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushPromises();
  expect(handleCancelProjectExportMock).toHaveBeenCalledWith(
    expect.objectContaining({ jobId: 'job-1' }),
    sendResponse
  );
});

it('routes project export capability probes through the export owner', () => {
  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        jobId: 'job-1',
        settings: exportSettings,
        type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
      }),
      sendResponse,
      undefined,
      sender
    )
  ).toEqual(createRouteResult('export-capabilities'));
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
