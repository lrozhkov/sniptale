import { beforeEach, expect, it, vi } from 'vitest';

const { loadActiveLedgerMock, loggerWarnMock, markTerminalMock, sendRuntimeMessageMock } =
  vi.hoisted(() => ({
    loadActiveLedgerMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    markTerminalMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  }));

vi.mock('@sniptale/foundation/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/best-effort')>()),
  runBestEffort: vi.fn((promise: Promise<unknown>) => promise),
}));
vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({ error: vi.fn(), log: vi.fn(), warn: loggerWarnMock })),
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
  markProjectExportJobTerminal: markTerminalMock,
}));
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoProjectExportPhase } from '../../../../../../features/video/project/types';
import { reconcileProjectExportLedgerAfterOffscreenCreation } from './reconcile';

const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';

function createRunningLedger(owner: { documentId: string | null; senderUrl: string | null }) {
  return {
    cancelRequested: false,
    jobId: 'job-stale',
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

beforeEach(() => {
  vi.clearAllMocks();
  markTerminalMock.mockResolvedValue(undefined);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

it('marks interrupted exports failed and notifies the active editor owner', async () => {
  loadActiveLedgerMock.mockResolvedValueOnce(
    createRunningLedger({ documentId: 'editor-doc-1', senderUrl: VIDEO_EDITOR_URL })
  );

  await reconcileProjectExportLedgerAfterOffscreenCreation(true);

  expect(markTerminalMock).toHaveBeenCalledWith(
    'job-stale',
    'failed',
    'offscreenExport.interruptedByRuntimeRestart'
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.PROJECT_EXPORT_FAILED,
    jobId: 'job-stale',
    error: 'offscreenExport.interruptedByRuntimeRestart',
    targetDocumentId: 'editor-doc-1',
    targetSenderUrl: VIDEO_EDITOR_URL,
  });
});

it('does not broadcast unowned interrupted export failures', async () => {
  loadActiveLedgerMock.mockResolvedValueOnce(
    createRunningLedger({ documentId: null, senderUrl: null })
  );

  await reconcileProjectExportLedgerAfterOffscreenCreation(true);

  expect(markTerminalMock).toHaveBeenCalledWith(
    'job-stale',
    'failed',
    'offscreenExport.interruptedByRuntimeRestart'
  );
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Interrupted project export has no active editor owner',
    { jobId: 'job-stale' }
  );
});
