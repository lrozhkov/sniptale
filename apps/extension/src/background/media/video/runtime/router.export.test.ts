import { beforeEach, expect, it, vi } from 'vitest';

const {
  createUnhandledRouteResultMock,
  handleCancelProjectExportMock,
  handleGetProjectExportCapabilitiesMock,
  handleOffscreenReadyMock,
  handleStartProjectExportMock,
} = vi.hoisted(() => ({
  createUnhandledRouteResultMock: vi.fn(),
  handleCancelProjectExportMock: vi.fn(),
  handleGetProjectExportCapabilitiesMock: vi.fn(),
  handleOffscreenReadyMock: vi.fn(),
  handleStartProjectExportMock: vi.fn(),
}));

vi.mock('./handlers', () => ({
  RouteResult: undefined,
  createUnhandledRouteResult: createUnhandledRouteResultMock,
  handleCancelProjectExport: handleCancelProjectExportMock,
  handleDownloadRecording: vi.fn(),
  handleDownloadRecordingSidecar: vi.fn(),
  handleGetProjectExportCapabilities: handleGetProjectExportCapabilitiesMock,
  handleInternalVideoSignal: vi.fn(),
  handleOffscreenError: vi.fn(),
  handleOffscreenReady: handleOffscreenReadyMock,
  handleOffscreenRecordingPaused: vi.fn(),
  handleOffscreenRecordingResumed: vi.fn(),
  handleOffscreenRecordingStarted: vi.fn(),
  handleOffscreenRecordingStopped: vi.fn(),
  handleRecordingDurationUpdated: vi.fn(),
  handleRecordingState: vi.fn(),
  handleRecordingTabId: vi.fn(),
  handleProjectExportLifecycleMessage: vi.fn(),
  handleRegisterCameraRecorderControl: vi.fn(),
  handleStartProjectExport: handleStartProjectExportMock,
  handleVideoSavedToIdb: vi.fn(),
}));
vi.mock('./handlers/export/project-export', () => ({
  handleCancelProjectExport: handleCancelProjectExportMock,
  handleGetProjectExportCapabilities: handleGetProjectExportCapabilitiesMock,
  handleStartProjectExport: handleStartProjectExportMock,
}));
vi.mock('./handlers/state/offscreen-lifecycle', () => ({
  createUnhandledRouteResult: createUnhandledRouteResultMock,
  handleInternalVideoSignal: vi.fn(),
  handleOffscreenError: vi.fn(),
  handleOffscreenReady: handleOffscreenReadyMock,
  handleProjectExportLifecycleMessage: vi.fn(),
  handleVideoSavedToIdb: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();
  return {
    ...original,
    runtimeInfo: {
      ...original.runtimeInfo,
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
  };
});
import {
  VideoExportFormat,
  VideoExportQualityPreset,
} from '../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import { routeVideoRuntimeMessage } from './router';
import {
  issueProjectExportCancelCapability,
  issueProjectExportStartCapability,
  resetProjectExportRuntimeCapabilitiesForTests,
} from './export-capabilities';

const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';
const VIDEO_EDITOR_OWNER = {
  documentId: 'editor-doc-1',
  kind: 'project-export' as const,
  senderUrl: VIDEO_EDITOR_URL,
};

function createSendResponse() {
  return vi.fn();
}

function createSender(url = VIDEO_EDITOR_URL): chrome.runtime.MessageSender {
  return { documentId: 'editor-doc-1', url };
}

function createRouteResult(label: string) {
  return { handled: true, keepChannelOpen: label.includes('async') };
}

function asRuntimeMessage(message: VideoRuntimeMessage): VideoRuntimeMessage {
  return message;
}

function createInputReference() {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId: 'job-1',
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

function createExportSettings() {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
  };
}

async function createStartExportMessage(): Promise<VideoRuntimeMessage> {
  const settings = createExportSettings();
  return {
    type: VideoMessageType.START_PROJECT_EXPORT,
    capabilityToken: await issueProjectExportStartCapability({
      documentId: 'editor-doc-1',
      jobId: 'job-1',
      senderUrl: VIDEO_EDITOR_URL,
      settings,
    }),
    jobId: 'job-1',
    input: createInputReference(),
    settings,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetProjectExportRuntimeCapabilitiesForTests();
  handleStartProjectExportMock.mockReturnValue(createRouteResult('start-export-async'));
  handleCancelProjectExportMock.mockReturnValue(createRouteResult('cancel-export-async'));
  handleGetProjectExportCapabilitiesMock.mockReturnValue(
    createRouteResult('get-export-capabilities-async')
  );
  handleOffscreenReadyMock.mockReturnValue(createRouteResult('offscreen-ready'));
  createUnhandledRouteResultMock.mockReturnValue({ handled: false, keepChannelOpen: false });
});

it('routes project export start messages through their export owners', async () => {
  const sendResponse = createSendResponse();
  const startMessage = await createStartExportMessage();

  expect(
    routeVideoRuntimeMessage(
      startMessage,
      sendResponse,
      undefined,
      createSender(),
      VIDEO_EDITOR_OWNER
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushPromises();
  expect(handleStartProjectExportMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.START_PROJECT_EXPORT,
      capabilityToken: expect.any(String),
      jobId: 'job-1',
      input: createInputReference(),
      settings: createExportSettings(),
    },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
});

it('routes project export cancel messages through their export owners', async () => {
  const sendResponse = createSendResponse();
  const cancelToken = await issueProjectExportCancelCapability({
    documentId: 'editor-doc-1',
    jobId: 'job-1',
    senderUrl: VIDEO_EDITOR_URL,
  });
  const cancelMessage = asRuntimeMessage({
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    capabilityToken: cancelToken,
    jobId: 'job-1',
  });
  expect(
    routeVideoRuntimeMessage(
      cancelMessage,
      sendResponse,
      undefined,
      createSender(),
      VIDEO_EDITOR_OWNER
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushPromises();
  expect(handleCancelProjectExportMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.CANCEL_PROJECT_EXPORT,
      capabilityToken: cancelToken,
      jobId: 'job-1',
    },
    sendResponse
  );
});

it('routes project export capability messages through their export owners', () => {
  const sendResponse = createSendResponse();

  expect(
    routeVideoRuntimeMessage(
      asRuntimeMessage({
        type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
        jobId: 'job-1',
        settings: createExportSettings(),
      }),
      sendResponse,
      undefined,
      createSender()
    )
  ).toEqual(createRouteResult('get-export-capabilities-async'));
  expect(handleGetProjectExportCapabilitiesMock).toHaveBeenCalledWith(
    {
      type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
      jobId: 'job-1',
      settings: createExportSettings(),
    },
    sendResponse,
    expect.objectContaining({
      documentId: 'editor-doc-1',
      senderUrl: VIDEO_EDITOR_URL,
    })
  );
});

it('rejects project export messages from non-video-editor extension senders before side effects', () => {
  const sendResponse = createSendResponse();
  const message = asRuntimeMessage({
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    jobId: 'job-1',
    settings: createExportSettings(),
  });

  for (const sender of [
    createSender('chrome-extension://test/apps/extension/src/popup/index.html'),
    createSender('chrome-extension://test/apps/extension/src/settings/index.html'),
    createSender('chrome-extension://test/apps/extension/src/gallery/index.html'),
    createSender('chrome-extension://test/apps/extension/src/scenario-editor/index.html'),
    { tab: { id: 7 } as chrome.tabs.Tab, url: 'https://example.test/page' },
  ]) {
    sendResponse.mockClear();
    expect(routeVideoRuntimeMessage(message, sendResponse, sender.tab?.id, sender)).toEqual({
      handled: true,
      keepChannelOpen: false,
    });
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized video export sender',
    });
  }

  expect(handleGetProjectExportCapabilitiesMock).not.toHaveBeenCalled();
  expect(handleStartProjectExportMock).not.toHaveBeenCalled();
  expect(handleCancelProjectExportMock).not.toHaveBeenCalled();
});

it('routes OFFSCREEN_READY through its runtime owner', () => {
  const sendResponse = createSendResponse();

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
});
