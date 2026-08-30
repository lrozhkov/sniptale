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
vi.mock('../../../../../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../offscreen-document/service')>()),
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

function createExportSettings() {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.MEDIUM,
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
  loadActiveLedgerMock.mockResolvedValueOnce(createRunningLedger(VIDEO_EDITOR_OWNER));

  const response = await handleGetProjectExportCapabilities(
    { jobId: 'job-4', settings: createExportSettings() },
    VIDEO_EDITOR_OWNER
  );
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
  loadActiveLedgerMock.mockResolvedValueOnce(createRunningLedger(OTHER_VIDEO_EDITOR_OWNER));

  const response = await handleGetProjectExportCapabilities(
    { jobId: 'job-4', settings: createExportSettings() },
    VIDEO_EDITOR_OWNER
  );
  expect(response).toEqual(
    expect.not.objectContaining({ cancelCapabilityToken: expect.any(String) })
  );
  expect(response).toEqual(expect.not.objectContaining({ capabilityToken: expect.any(String) }));
});

it('does not issue start authority while another export job is running', async () => {
  loadActiveLedgerMock.mockResolvedValueOnce({
    ...createRunningLedger(VIDEO_EDITOR_OWNER),
    jobId: 'job-other',
  });

  const response = await handleGetProjectExportCapabilities(
    { jobId: 'job-4', settings: createExportSettings() },
    VIDEO_EDITOR_OWNER
  );
  expect(response).toEqual(
    expect.not.objectContaining({ cancelCapabilityToken: expect.any(String) })
  );
  expect(response).toEqual(expect.not.objectContaining({ capabilityToken: expect.any(String) }));
});

it('issues start authority when no active ledger owns the requested job', async () => {
  const settings = createExportSettings();
  loadActiveLedgerMock.mockResolvedValueOnce(null);

  const response = await handleGetProjectExportCapabilities(
    { jobId: 'job-4', settings },
    VIDEO_EDITOR_OWNER
  );
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
  const response = await handleGetProjectExportCapabilities(
    { settings: createExportSettings() },
    VIDEO_EDITOR_OWNER
  );

  expect(loadActiveLedgerMock).not.toHaveBeenCalled();
  expect(response).toEqual(
    expect.objectContaining({
      capabilities: expect.any(Object),
      success: true,
    })
  );
});
