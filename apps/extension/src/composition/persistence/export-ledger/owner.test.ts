import { beforeEach, expect, it, vi } from 'vitest';
import { VideoProjectExportPhase } from '../../../features/video/project/types/index';

const {
  browserStorageSessionGetMock,
  browserStorageSessionIsAvailableMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionIsAvailableMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    session: {
      get: browserStorageSessionGetMock,
      isAvailable: browserStorageSessionIsAvailableMock,
      remove: browserStorageSessionRemoveMock,
      set: browserStorageSessionSetMock,
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: vi.fn() }),
}));

const STORAGE_KEY = 'sniptale_project_export_active_job';
const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createCompletedLedgerEntry(jobId: string, projectId: string): Record<string, unknown> {
  return createTerminalLedgerEntry(jobId, projectId, 'completed', VideoProjectExportPhase.DONE);
}

function createTerminalLedgerEntry(
  jobId: string,
  projectId: string,
  status: 'completed' | 'failed' | 'cancelled',
  phase: VideoProjectExportPhase,
  terminalError: string | null = null
): Record<string, unknown> {
  return {
    cancelRequested: status === 'cancelled',
    jobId,
    ownerDocumentId: null,
    ownerSenderUrl: null,
    phase,
    progress: status === 'completed' ? 100 : 80,
    projectId,
    startedAt: 500,
    status,
    terminalError,
    updatedAt: 900,
  };
}

const terminalCleanupCases = [
  { phase: VideoProjectExportPhase.DONE, status: 'completed', terminalError: null },
  { phase: VideoProjectExportPhase.FAILED, status: 'failed', terminalError: 'interrupted' },
  { phase: VideoProjectExportPhase.CANCELLED, status: 'cancelled', terminalError: null },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  browserStorageSessionGetMock.mockResolvedValue({});
  browserStorageSessionIsAvailableMock.mockReturnValue(true);
  browserStorageSessionRemoveMock.mockResolvedValue(undefined);
  browserStorageSessionSetMock.mockResolvedValue(undefined);
});

it('stores owner identity for active export cancellation reissue', async () => {
  const { upsertProjectExportJobLedgerEntry } = await import('./index');

  await upsertProjectExportJobLedgerEntry({
    jobId: 'job-owner',
    ownerDocumentId: 'editor-doc-1',
    ownerSenderUrl: VIDEO_EDITOR_URL,
    projectId: 'project-1',
  });

  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [STORAGE_KEY]: expect.objectContaining({
      jobId: 'job-owner',
      ownerDocumentId: 'editor-doc-1',
      ownerSenderUrl: VIDEO_EDITOR_URL,
    }),
  });
});

it('reserves a new export only when no running ledger exists', async () => {
  const { reserveProjectExportJobLedgerEntry } = await import('./index');
  browserStorageSessionGetMock.mockResolvedValueOnce({
    [STORAGE_KEY]: {
      cancelRequested: false,
      jobId: 'job-running',
      ownerDocumentId: 'editor-doc-2',
      ownerSenderUrl: VIDEO_EDITOR_URL,
      phase: VideoProjectExportPhase.RENDERING,
      progress: 40,
      projectId: 'project-1',
      startedAt: 500,
      status: 'running',
      terminalError: null,
      updatedAt: 700,
    },
  });

  await expect(
    reserveProjectExportJobLedgerEntry({
      jobId: 'job-owner',
      ownerDocumentId: 'editor-doc-1',
      ownerSenderUrl: VIDEO_EDITOR_URL,
      projectId: 'project-1',
    })
  ).rejects.toThrow('Another project export is already running');
  expect(browserStorageSessionSetMock).not.toHaveBeenCalled();
});

it('serializes competing export reservations without overwriting the first owner', async () => {
  const { reserveProjectExportJobLedgerEntry } = await import('./index');
  let storedLedger: unknown;
  browserStorageSessionGetMock.mockImplementation(async () => ({ [STORAGE_KEY]: storedLedger }));
  browserStorageSessionSetMock.mockImplementation(async (value: Record<string, unknown>) => {
    storedLedger = value[STORAGE_KEY];
  });

  const firstReservation = reserveProjectExportJobLedgerEntry({
    jobId: 'job-first',
    ownerDocumentId: 'editor-doc-1',
    ownerSenderUrl: VIDEO_EDITOR_URL,
    projectId: 'project-1',
  });
  const secondReservation = reserveProjectExportJobLedgerEntry({
    jobId: 'job-second',
    ownerDocumentId: 'editor-doc-2',
    ownerSenderUrl: VIDEO_EDITOR_URL,
    projectId: 'project-2',
  });

  await expect(firstReservation).resolves.toEqual(
    expect.objectContaining({
      jobId: 'job-first',
      ownerDocumentId: 'editor-doc-1',
      status: 'running',
    })
  );
  await expect(secondReservation).rejects.toThrow('Another project export is already running');
  expect(browserStorageSessionSetMock).toHaveBeenCalledTimes(1);
  expect(storedLedger).toEqual(
    expect.objectContaining({
      jobId: 'job-first',
      ownerDocumentId: 'editor-doc-1',
      projectId: 'project-1',
    })
  );
});

it('serializes stale ledger clear behind newer reservations', async () => {
  const { clearProjectExportJobLedgerEntry, reserveProjectExportJobLedgerEntry } =
    await import('./index');
  const setStarted = createDeferred();
  const allowSet = createDeferred();
  const setFinished = createDeferred();
  let storedLedger: unknown = createCompletedLedgerEntry('job-old', 'project-old');
  browserStorageSessionGetMock.mockImplementation(async () => ({ [STORAGE_KEY]: storedLedger }));
  browserStorageSessionSetMock.mockImplementation(async (value: Record<string, unknown>) => {
    setStarted.resolve();
    await allowSet.promise;
    storedLedger = value[STORAGE_KEY];
    setFinished.resolve();
  });
  browserStorageSessionRemoveMock.mockImplementation(async () => {
    await setFinished.promise;
    storedLedger = undefined;
  });

  const reservation = reserveProjectExportJobLedgerEntry({
    jobId: 'job-new',
    ownerDocumentId: 'editor-doc-2',
    ownerSenderUrl: VIDEO_EDITOR_URL,
    projectId: 'project-new',
  });
  await setStarted.promise;
  const staleClear = clearProjectExportJobLedgerEntry('job-old');
  allowSet.resolve();

  await expect(reservation).resolves.toEqual(expect.objectContaining({ jobId: 'job-new' }));
  await expect(staleClear).resolves.toBeUndefined();
  expect(browserStorageSessionRemoveMock).not.toHaveBeenCalled();
  expect(storedLedger).toEqual(
    expect.objectContaining({
      jobId: 'job-new',
      projectId: 'project-new',
    })
  );
});

it.each(terminalCleanupCases)(
  'clears only the intended $status ledger entry',
  async ({ phase, status, terminalError }) => {
    const { clearProjectExportJobLedgerEntry } = await import('./index');
    let storedLedger: unknown = createTerminalLedgerEntry(
      'job-target',
      'project-target',
      status,
      phase,
      terminalError
    );
    browserStorageSessionGetMock.mockImplementation(async () => ({ [STORAGE_KEY]: storedLedger }));
    browserStorageSessionRemoveMock.mockImplementation(async () => {
      storedLedger = undefined;
    });

    await clearProjectExportJobLedgerEntry('job-target');
    expect(browserStorageSessionRemoveMock).toHaveBeenCalledTimes(1);
    expect(storedLedger).toBeUndefined();

    storedLedger = createTerminalLedgerEntry(
      'job-other',
      'project-other',
      status,
      phase,
      terminalError
    );
    await clearProjectExportJobLedgerEntry('job-target');
    expect(browserStorageSessionRemoveMock).toHaveBeenCalledTimes(1);
    expect(storedLedger).toEqual(expect.objectContaining({ jobId: 'job-other' }));
  }
);

it('loads legacy export ledgers without owner as non-reissuable entries', async () => {
  const { loadActiveProjectExportJobLedgerEntry } = await import('./index');
  browserStorageSessionGetMock.mockResolvedValueOnce({
    [STORAGE_KEY]: {
      cancelRequested: false,
      jobId: 'job-legacy',
      phase: VideoProjectExportPhase.RENDERING,
      progress: 40,
      projectId: 'project-1',
      startedAt: 500,
      status: 'running',
      terminalError: null,
      updatedAt: 700,
    },
  });

  await expect(loadActiveProjectExportJobLedgerEntry()).resolves.toEqual(
    expect.objectContaining({
      jobId: 'job-legacy',
      ownerDocumentId: null,
      ownerSenderUrl: null,
    })
  );
});
