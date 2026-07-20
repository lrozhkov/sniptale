import { beforeEach, expect, it, vi } from 'vitest';

const { loadActiveProjectExportJobLedgerEntryMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  loadActiveProjectExportJobLedgerEntryMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('@sniptale/foundation/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/best-effort')>()),
  runBestEffort: vi.fn((promise: Promise<unknown>) => promise),
}));
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({ error: vi.fn(), log: vi.fn(), warn: vi.fn() })),
}));
vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../../../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../composition/persistence/export-ledger')
  >()),
  loadActiveProjectExportJobLedgerEntry: loadActiveProjectExportJobLedgerEntryMock,
}));
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { handleProjectExportLifecycleMessage } from './offscreen-lifecycle';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  loadActiveProjectExportJobLedgerEntryMock.mockResolvedValue({
    abortController: new AbortController(),
    jobId: 'job-1',
    ownerDocumentId: 'editor-doc-1',
    ownerSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
    projectId: 'project-1',
    source: 'editor',
    startedAt: 1,
  });
});

it('forwards raw project export lifecycle events to the active editor owner', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleProjectExportLifecycleMessage(
      {
        type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
        jobId: 'job-1',
        status: {
          message: 'Rendering',
          phase: 'RENDERING',
          progress: 25,
        },
      },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushAsyncRoute();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
    jobId: 'job-1',
    status: {
      message: 'Rendering',
      phase: 'RENDERING',
      progress: 25,
    },
    targetDocumentId: 'editor-doc-1',
    targetSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('accepts already-scoped project export lifecycle events without rebroadcasting', () => {
  const sendResponse = createSendResponse();

  expect(
    handleProjectExportLifecycleMessage(
      {
        type: VideoMessageType.PROJECT_EXPORT_FAILED,
        jobId: 'job-1',
        error: 'interrupted',
        targetDocumentId: 'editor-doc-1',
        targetSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
      },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: false });

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('fills missing owner fields on partially scoped project export lifecycle events', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleProjectExportLifecycleMessage(
      {
        type: VideoMessageType.PROJECT_EXPORT_FAILED,
        jobId: 'job-1',
        error: 'interrupted',
        targetDocumentId: 'editor-doc-1',
      },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushAsyncRoute();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.PROJECT_EXPORT_FAILED,
    jobId: 'job-1',
    error: 'interrupted',
    targetDocumentId: 'editor-doc-1',
    targetSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('accepts unowned project export lifecycle events without rebroadcasting', async () => {
  const sendResponse = createSendResponse();
  loadActiveProjectExportJobLedgerEntryMock.mockResolvedValueOnce(null);

  expect(
    handleProjectExportLifecycleMessage(
      {
        type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
        jobId: 'missing-job',
        status: {
          message: 'Rendering',
          phase: 'RENDERING',
          progress: 25,
        },
      },
      sendResponse
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushAsyncRoute();

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});
