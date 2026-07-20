import { beforeEach, expect, it, vi } from 'vitest';

const {
  ensureOffscreenDocumentMock,
  hasOffscreenDocumentMock,
  loadActiveLedgerMock,
  requestCancelMock,
  sendRuntimeMessageMock,
  waitForOffscreenReadyMock,
} = vi.hoisted(() => ({
  ensureOffscreenDocumentMock: vi.fn(),
  hasOffscreenDocumentMock: vi.fn(),
  loadActiveLedgerMock: vi.fn(),
  requestCancelMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  waitForOffscreenReadyMock: vi.fn(),
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
vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/export-ledger')>()),
  loadActiveProjectExportJobLedgerEntry: loadActiveLedgerMock,
  requestProjectExportJobCancel: requestCancelMock,
}));
vi.mock('../../../media/video/runtime/offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media/video/runtime/offscreen-manager')>()),
  ensureOffscreenDocument: ensureOffscreenDocumentMock,
  hasOffscreenDocument: hasOffscreenDocumentMock,
  waitForOffscreenReady: waitForOffscreenReadyMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoProjectExportPhase,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../contracts/video/types/messages';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';
import { createActionContext } from './context';
import { handleVideoRuntimeAction } from './handlers';
import type { VideoRuntimeAction } from './types';
import {
  issueProjectExportCancelCapability,
  resetProjectExportRuntimeCapabilitiesForTests,
} from '../../../media/video/runtime/export-capabilities';

const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';
const VIDEO_EDITOR_DOCUMENT_ID = 'editor-doc-1';

function createSender(): chrome.runtime.MessageSender {
  return {
    documentId: VIDEO_EDITOR_DOCUMENT_ID,
    url: VIDEO_EDITOR_URL,
  };
}

function createExportSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function createCapabilitiesResponse() {
  return {
    capabilities: {
      defaultMp4VideoCodec: 'AVC',
      formats: [{ available: true, format: 'mp4' }],
      mp4Codecs: [{ available: true, codec: 'AVC' }],
    },
    success: true,
  };
}

function createRunningLedger() {
  return {
    cancelRequested: false,
    jobId: 'job-1',
    ownerDocumentId: VIDEO_EDITOR_DOCUMENT_ID,
    ownerSenderUrl: VIDEO_EDITOR_URL,
    phase: VideoProjectExportPhase.RENDERING,
    progress: 40,
    projectId: 'project-1',
    startedAt: 100,
    status: 'running',
    terminalError: null,
    updatedAt: 200,
  };
}

function asRuntimeMessage(message: VideoRuntimeMessage): VideoRuntimeMessage {
  return message;
}

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

type SendResponseMock = ReturnType<typeof createSendResponse>;

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function routeCancel(sendResponse: SendResponseMock, capabilityToken: string): void {
  routeProjectExportMessage(
    sendResponse,
    asRuntimeMessage({
      capabilityToken,
      jobId: 'job-1',
      type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    })
  );
}

async function routeCancelAndFlush(
  sendResponse: SendResponseMock,
  capabilityToken: string
): Promise<void> {
  routeCancel(sendResponse, capabilityToken);
  await flushPromises();
}

async function routeCapabilitiesAndFlush(sendResponse: SendResponseMock): Promise<void> {
  routeProjectExportMessage(
    sendResponse,
    asRuntimeMessage({
      jobId: 'job-1',
      settings: createExportSettings(),
      type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    })
  );
  await flushPromises();
}

function routeProjectExportMessage(
  sendResponse: SendResponseMock,
  message: VideoRuntimeMessage
): void {
  handleVideoRuntimeAction(createVideoRuntimeAction(message, sendResponse));
}

function createVideoRuntimeAction(
  message: VideoRuntimeMessage,
  sendResponse: SendResponseMock
): VideoRuntimeAction {
  return {
    actionKind: 'video-runtime',
    context: createActionContext({
      logger: { warn: vi.fn() },
      runtimeState: createBackgroundRuntimeState(),
      sendResponse,
      sender: createSender(),
    }),
    message,
    routeName: `video-runtime:${message.type}`,
  };
}

function readLastCancelCapabilityToken(sendResponse: SendResponseMock): string {
  const reissueResponse = sendResponse.mock.calls.at(-1)?.[0] as {
    cancelCapabilityToken?: string;
    success?: boolean;
  };
  expect(reissueResponse).toEqual(
    expect.objectContaining({
      cancelCapabilityToken: expect.any(String),
      success: true,
    })
  );
  return reissueResponse.cancelCapabilityToken ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
  resetProjectExportRuntimeCapabilitiesForTests();
  ensureOffscreenDocumentMock.mockResolvedValue(false);
  hasOffscreenDocumentMock.mockReturnValue(true);
  loadActiveLedgerMock.mockResolvedValue(createRunningLedger());
  requestCancelMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  waitForOffscreenReadyMock.mockResolvedValue(undefined);
});

it('reissues owner-bound cancel authority after an async cancel failure consumes the old token', async () => {
  const sendResponse = createSendResponse();
  const initialCancelToken = await issueProjectExportCancelCapability({
    documentId: VIDEO_EDITOR_DOCUMENT_ID,
    jobId: 'job-1',
    senderUrl: VIDEO_EDITOR_URL,
  });
  sendRuntimeMessageMock
    .mockRejectedValueOnce(new Error('offscreen unavailable'))
    .mockResolvedValueOnce(createCapabilitiesResponse())
    .mockResolvedValueOnce({ success: true });

  await routeCancelAndFlush(sendResponse, initialCancelToken);
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'offscreen unavailable',
    success: false,
  });

  await routeCancelAndFlush(sendResponse, initialCancelToken);
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'Unauthorized project export capability',
    success: false,
  });

  await routeCapabilitiesAndFlush(sendResponse);
  await routeCancelAndFlush(sendResponse, readLastCancelCapabilityToken(sendResponse));
  expect(sendResponse).toHaveBeenLastCalledWith({
    jobId: 'job-1',
    result: 'accepted',
    success: true,
  });
});
