import { beforeEach, expect, it, vi } from 'vitest';

const {
  loadActiveProjectExportJobLedgerEntryMock,
  sendRuntimeMessageMock,
  markTerminalMock,
  upsertLedgerMock,
} = vi.hoisted(() => ({
  loadActiveProjectExportJobLedgerEntryMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  markTerminalMock: vi.fn(),
  upsertLedgerMock: vi.fn(),
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
  markProjectExportJobTerminal: markTerminalMock,
  upsertProjectExportJobLedgerEntry: upsertLedgerMock,
}));
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoExportFormat } from '../../../../../../features/video/project/types';
import { handleProjectExportLifecycleMessage } from './offscreen-lifecycle';

const routeResponses: Array<ReturnType<typeof vi.fn>> = [];
function createSendResponse() {
  const response = vi.fn<(response?: unknown) => void>();
  routeResponses.push(response);
  return response;
}

async function flushAsyncRoute() {
  await vi.waitFor(() => expect(routeResponses.at(-1)).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  routeResponses.length = 0;
  markTerminalMock.mockImplementation(async (_jobId, status) => ({ status }));
  upsertLedgerMock.mockImplementation(async (entry) => ({ ...entry, status: 'running' }));
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  loadActiveProjectExportJobLedgerEntryMock.mockResolvedValue({
    status: 'running',
    phase: 'RENDERING',
    progress: 25,
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

it.each([
  {
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
    status: 'completed',
    projectId: 'project-1',
    exportId: 'export-1',
    filename: 'export.mp4',
    format: VideoExportFormat.MP4,
  },
  { type: VideoMessageType.PROJECT_EXPORT_FAILED, status: 'failed', error: 'render failed' },
  { type: VideoMessageType.PROJECT_EXPORT_CANCELLED, status: 'cancelled' },
] as const)(
  'persists $status before the editor receives its terminal event',
  async ({ status, ...event }) => {
    const sendResponse = createSendResponse();
    handleProjectExportLifecycleMessage({ ...event, jobId: 'job-1' }, sendResponse);
    await flushAsyncRoute();
    expect(markTerminalMock).toHaveBeenCalledWith(
      'job-1',
      status,
      'error' in event ? event.error : null
    );
    expect(markTerminalMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendRuntimeMessageMock.mock.invocationCallOrder[0]!
    );
  }
);

it('does not claim completion before its ledger write settles', async () => {
  let finish: ((value: { status: string }) => void) | undefined;
  markTerminalMock.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const sendResponse = createSendResponse();
  handleProjectExportLifecycleMessage(
    { type: VideoMessageType.PROJECT_EXPORT_CANCELLED, jobId: 'job-1' },
    sendResponse
  );
  await vi.waitFor(() => expect(markTerminalMock).toHaveBeenCalled());
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  finish?.({ status: 'cancelled' });
  await flushAsyncRoute();
  expect(sendRuntimeMessageMock).toHaveBeenCalled();
});

it('does not forward success when the terminal write fails', async () => {
  markTerminalMock.mockRejectedValueOnce(new Error('storage unavailable'));
  const sendResponse = createSendResponse();
  handleProjectExportLifecycleMessage(
    { type: VideoMessageType.PROJECT_EXPORT_CANCELLED, jobId: 'job-1' },
    sendResponse
  );
  await flushAsyncRoute();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Internal error' });
});

it('ignores a superseded job without changing the current ledger', async () => {
  const sendResponse = createSendResponse();
  handleProjectExportLifecycleMessage(
    { type: VideoMessageType.PROJECT_EXPORT_CANCELLED, jobId: 'old-job' },
    sendResponse
  );
  await flushAsyncRoute();
  expect(markTerminalMock).not.toHaveBeenCalled();
  expect(upsertLedgerMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('does not replay late progress after completion', async () => {
  loadActiveProjectExportJobLedgerEntryMock.mockResolvedValueOnce({
    jobId: 'job-1',
    status: 'completed',
    ownerDocumentId: 'editor-doc-1',
    ownerSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
    projectId: 'project-1',
  });
  const sendResponse = createSendResponse();
  handleProjectExportLifecycleMessage(
    {
      type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
      jobId: 'job-1',
      status: { phase: 'RENDERING', progress: 50, message: 'Rendering' },
    },
    sendResponse
  );
  await flushAsyncRoute();
  expect(upsertLedgerMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('reports a cancellation that won the ledger transition instead of completion', async () => {
  markTerminalMock.mockResolvedValueOnce({ status: 'cancelled' });
  const sendResponse = createSendResponse();
  handleProjectExportLifecycleMessage(
    {
      type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
      jobId: 'job-1',
      projectId: 'project-1',
      exportId: 'export-1',
      filename: 'export.mp4',
      format: VideoExportFormat.MP4,
    },
    sendResponse
  );
  await flushAsyncRoute();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.PROJECT_EXPORT_CANCELLED,
    jobId: 'job-1',
    targetDocumentId: 'editor-doc-1',
    targetSenderUrl: 'chrome-extension://id/apps/extension/src/video-editor/index.html',
  });
});

it('does not accept completion for a different project', async () => {
  const sendResponse = createSendResponse();
  handleProjectExportLifecycleMessage(
    {
      type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
      jobId: 'job-1',
      projectId: 'foreign-project',
      exportId: 'export-1',
      filename: 'export.mp4',
      format: VideoExportFormat.MP4,
    },
    sendResponse
  );
  await flushAsyncRoute();
  expect(markTerminalMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('forwards the committed percentage when a retry reports earlier progress', async () => {
  upsertLedgerMock.mockResolvedValue({ phase: 'RENDERING', progress: 80, status: 'running' });
  handleProjectExportLifecycleMessage(
    {
      type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
      jobId: 'job-1',
      status: { phase: 'RENDERING', progress: 20, message: 'Retry' },
    },
    createSendResponse()
  );
  await flushAsyncRoute();
  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      status: { phase: 'RENDERING', progress: 80, message: 'Retry' },
    })
  );
});
