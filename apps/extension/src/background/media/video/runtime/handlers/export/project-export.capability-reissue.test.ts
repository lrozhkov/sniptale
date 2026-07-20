import { beforeEach, expect, it, vi } from 'vitest';

const {
  ensureOffscreenDocumentMock,
  hasOffscreenDocumentMock,
  loadActiveLedgerMock,
  sendRuntimeMessageMock,
  waitForOffscreenReadyMock,
} = vi.hoisted(() => ({
  ensureOffscreenDocumentMock: vi.fn(),
  hasOffscreenDocumentMock: vi.fn(),
  loadActiveLedgerMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  waitForOffscreenReadyMock: vi.fn(),
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../../../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../composition/persistence/export-ledger')
  >()),
  loadActiveProjectExportJobLedgerEntry: loadActiveLedgerMock,
}));
vi.mock('../../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offscreen-manager')>()),
  ensureOffscreenDocument: ensureOffscreenDocumentMock,
  hasOffscreenDocument: hasOffscreenDocumentMock,
  waitForOffscreenReady: waitForOffscreenReadyMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoProjectExportPhase,
} from '../../../../../../features/video/project/types';
import {
  consumeProjectExportCancelCapability,
  consumeProjectExportStartCapability,
  resetProjectExportRuntimeCapabilitiesForTests,
} from '../../export-capabilities';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';
import { handleGetProjectExportCapabilities } from './project-export';

const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';
const VIDEO_EDITOR_OWNER = { documentId: 'editor-doc-1', senderUrl: VIDEO_EDITOR_URL };
const OTHER_VIDEO_EDITOR_OWNER = { documentId: 'editor-doc-2', senderUrl: VIDEO_EDITOR_URL };

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

function createExportSettings() {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function createRunningLedger(owner: { documentId: string | null; senderUrl: string | null }) {
  return {
    cancelRequested: false,
    jobId: 'job-4',
    ownerDocumentId: owner.documentId,
    ownerSenderUrl: owner.senderUrl,
    phase: VideoProjectExportPhase.RENDERING,
    progress: 30,
    projectId: 'project-1',
    startedAt: 100,
    status: 'running',
    terminalError: null,
    updatedAt: 200,
  };
}

function createCapabilitiesResponse() {
  return {
    success: true,
    capabilities: {
      defaultMp4VideoCodec: 'AVC',
      formats: [{ available: true, format: 'mp4' }],
      mp4Codecs: [{ available: true, codec: 'AVC' }],
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetProjectExportRuntimeCapabilitiesForTests();
  ensureOffscreenDocumentMock.mockResolvedValue(false);
  hasOffscreenDocumentMock.mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValue(createCapabilitiesResponse());
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  waitForOffscreenReadyMock.mockResolvedValue(undefined);
});

it('reissues cancel authority for the owner of a running export ledger entry', async () => {
  const sendResponse = createSendResponse();
  loadActiveLedgerMock.mockResolvedValueOnce(createRunningLedger(VIDEO_EDITOR_OWNER));

  handleGetProjectExportCapabilities(
    { jobId: 'job-4', settings: createExportSettings() },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  const response = sendResponse.mock.calls[0]?.[0] as { cancelCapabilityToken?: string };
  expect(response).toEqual(
    expect.objectContaining({
      cancelCapabilityToken: expect.any(String),
      ownerDocumentId: 'editor-doc-1',
      success: true,
    })
  );
  expect(
    await consumeProjectExportCancelCapability({
      documentId: 'editor-doc-1',
      jobId: 'job-4',
      senderUrl: VIDEO_EDITOR_URL,
      token: response.cancelCapabilityToken ?? '',
    })
  ).toBe(true);
});

it('does not issue start or cancel authority for a different owner of an active job', async () => {
  const sendResponse = createSendResponse();
  loadActiveLedgerMock.mockResolvedValueOnce(createRunningLedger(OTHER_VIDEO_EDITOR_OWNER));

  handleGetProjectExportCapabilities(
    { jobId: 'job-4', settings: createExportSettings() },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  const response = sendResponse.mock.calls[0]?.[0] as {
    cancelCapabilityToken?: string;
    capabilityToken?: string;
  };
  expect(response).toEqual(
    expect.not.objectContaining({ cancelCapabilityToken: expect.any(String) })
  );
  expect(response).toEqual(expect.not.objectContaining({ capabilityToken: expect.any(String) }));
});

it('does not issue start authority while another export job is running', async () => {
  const sendResponse = createSendResponse();
  loadActiveLedgerMock.mockResolvedValueOnce({
    ...createRunningLedger(VIDEO_EDITOR_OWNER),
    jobId: 'job-other',
  });

  handleGetProjectExportCapabilities(
    { jobId: 'job-4', settings: createExportSettings() },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  const response = sendResponse.mock.calls[0]?.[0] as {
    cancelCapabilityToken?: string;
    capabilityToken?: string;
  };
  expect(response).toEqual(
    expect.not.objectContaining({ cancelCapabilityToken: expect.any(String) })
  );
  expect(response).toEqual(expect.not.objectContaining({ capabilityToken: expect.any(String) }));
});

it('issues start authority when no active ledger owns the requested job', async () => {
  const sendResponse = createSendResponse();
  const settings = createExportSettings();
  loadActiveLedgerMock.mockResolvedValueOnce(null);

  handleGetProjectExportCapabilities(
    { jobId: 'job-4', settings },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  const response = sendResponse.mock.calls[0]?.[0] as { capabilityToken?: string };
  expect(response).toEqual(
    expect.objectContaining({
      capabilityToken: expect.any(String),
      ownerDocumentId: 'editor-doc-1',
      success: true,
    })
  );
  expect(
    await consumeProjectExportStartCapability({
      documentId: 'editor-doc-1',
      jobId: 'job-4',
      senderUrl: VIDEO_EDITOR_URL,
      settings,
      token: response.capabilityToken ?? '',
    })
  ).toBe(true);
});

it('returns raw capabilities without ledger lookup when no job id is requested', async () => {
  const sendResponse = createSendResponse();

  handleGetProjectExportCapabilities(
    { settings: createExportSettings() },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  expect(loadActiveLedgerMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      capabilities: expect.any(Object),
      success: true,
    })
  );
});
