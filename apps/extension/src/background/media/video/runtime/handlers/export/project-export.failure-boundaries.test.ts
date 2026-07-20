import { beforeEach, expect, it, vi } from 'vitest';

const {
  ensureOffscreenDocumentMock,
  hasOffscreenDocumentMock,
  loadActiveLedgerMock,
  loadProjectExportInputMock,
  markTerminalMock,
  requestCancelMock,
  reserveLedgerMock,
  sendRuntimeMessageMock,
  waitForOffscreenReadyMock,
} = vi.hoisted(() => ({
  ensureOffscreenDocumentMock: vi.fn(),
  hasOffscreenDocumentMock: vi.fn(),
  loadActiveLedgerMock: vi.fn(),
  loadProjectExportInputMock: vi.fn(),
  markTerminalMock: vi.fn(),
  requestCancelMock: vi.fn(),
  reserveLedgerMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  waitForOffscreenReadyMock: vi.fn(),
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../../../../../routing-contracts/response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../routing-contracts/response')>()),
  respondAsyncRouteWithLogger: vi.fn(
    ({
      work,
      sendResponse,
    }: {
      work: Promise<unknown>;
      sendResponse: (response?: unknown) => void;
    }) =>
      void work
        .then((response) => sendResponse(response))
        .catch((error: unknown) =>
          sendResponse({
            error: error instanceof Error ? error.message : String(error),
            success: false,
          })
        )
  ),
}));
vi.mock('../../../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../composition/persistence/export-ledger')
  >()),
  loadActiveProjectExportJobLedgerEntry: loadActiveLedgerMock,
  markProjectExportJobTerminal: markTerminalMock,
  requestProjectExportJobCancel: requestCancelMock,
  reserveProjectExportJobLedgerEntry: reserveLedgerMock,
}));
vi.mock(
  '../../../../../../composition/persistence/project-export-inputs',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../../composition/persistence/project-export-inputs')
    >()),
    deleteProjectExportInput: vi.fn(async () => undefined),
    loadProjectExportInput: loadProjectExportInputMock,
  })
);
vi.mock('../../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offscreen-manager')>()),
  ensureOffscreenDocument: ensureOffscreenDocumentMock,
  hasOffscreenDocument: hasOffscreenDocumentMock,
  waitForOffscreenReady: waitForOffscreenReadyMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../../../../features/video/project/types';
import {
  handleCancelProjectExport,
  handleGetProjectExportCapabilities,
  handleStartProjectExport,
} from './project-export';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';

const VIDEO_EDITOR_OWNER = {
  documentId: 'editor-doc-1',
  senderUrl: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
};

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

function createProject(): VideoProject {
  return {
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
}

function createInputReference() {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId: 'job-1',
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
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

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  loadProjectExportInputMock.mockResolvedValue(createProject());
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  ensureOffscreenDocumentMock.mockResolvedValue(false);
  hasOffscreenDocumentMock.mockReturnValue(true);
  loadActiveLedgerMock.mockResolvedValue(null);
  markTerminalMock.mockResolvedValue(null);
  requestCancelMock.mockResolvedValue(null);
  reserveLedgerMock.mockResolvedValue(null);
  sendRuntimeMessageMock.mockResolvedValue({ result: 'accepted', success: true });
  waitForOffscreenReadyMock.mockResolvedValue(undefined);
});

it('rejects project export launch when offscreen returns a failure ack', async () => {
  const sendResponse = createSendResponse();
  sendRuntimeMessageMock.mockResolvedValueOnce({
    error: 'launch rejected',
    success: false,
  });

  handleStartProjectExport(
    { input: createInputReference(), jobId: 'job-1', settings: createExportSettings() },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ capabilityToken: expect.any(String) })
  );
  expect(markTerminalMock).toHaveBeenCalledWith('job-1', 'failed', 'Error: launch rejected');
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'launch rejected',
    success: false,
  });
});

it('rejects project export launch when offscreen omits the acceptance ack', async () => {
  const sendResponse = createSendResponse();
  sendRuntimeMessageMock.mockResolvedValueOnce(undefined);

  handleStartProjectExport(
    { input: createInputReference(), jobId: 'job-1', settings: createExportSettings() },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ capabilityToken: expect.any(String) })
  );
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Project export launch rejected',
    success: false,
  });
});

it('rejects project export cancellation when offscreen returns a failure ack', async () => {
  const sendResponse = createSendResponse();
  sendRuntimeMessageMock.mockResolvedValueOnce({
    error: 'cancel rejected',
    success: false,
  });

  handleCancelProjectExport({ jobId: 'job-2' }, sendResponse);
  await flushPromises();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ capabilityToken: expect.any(String) })
  );
  expect(requestCancelMock).toHaveBeenCalledWith('job-2');
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'cancel rejected',
    success: false,
  });
});

it('does not issue export authority when capability probing fails', async () => {
  const sendResponse = createSendResponse();
  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('probe failed'));

  handleGetProjectExportCapabilities(
    { jobId: 'job-3', settings: createExportSettings() },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ capabilityToken: expect.any(String) })
  );
  expect(loadActiveLedgerMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'probe failed',
    success: false,
  });
});

it('does not issue export authority for unsuccessful capability responses', async () => {
  const sendResponse = createSendResponse();
  sendRuntimeMessageMock.mockResolvedValueOnce({
    error: 'codec unsupported',
    success: false,
  });

  handleGetProjectExportCapabilities(
    { jobId: 'job-3', settings: createExportSettings() },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ capabilityToken: expect.any(String) })
  );
  expect(loadActiveLedgerMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'codec unsupported',
    success: false,
  });
});

it('probes capabilities even when an existing offscreen document is not observable yet', async () => {
  const sendResponse = createSendResponse();
  hasOffscreenDocumentMock.mockReturnValueOnce(false);

  handleGetProjectExportCapabilities(
    { settings: createExportSettings() },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  expect(waitForOffscreenReadyMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ capabilityToken: expect.any(String) })
  );
});
