import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  createLogger: () => ({
    warn: vi.fn(),
  }),
}));

const STORAGE_KEY = 'sniptale_project_export_active_job';

function createRunningLedgerEntry() {
  return {
    jobId: 'job-1',
    ownerDocumentId: null,
    ownerSenderUrl: null,
    projectId: 'project-1',
    phase: VideoProjectExportPhase.SAVING,
    progress: 80,
    status: 'running',
    startedAt: 500,
    updatedAt: 700,
    cancelRequested: false,
    terminalError: null,
  };
}

function mockMonotonicLedgerReads(): void {
  const runningEntry = createRunningLedgerEntry();

  browserStorageSessionGetMock
    .mockResolvedValueOnce({ [STORAGE_KEY]: runningEntry })
    .mockResolvedValueOnce({
      [STORAGE_KEY]: {
        ...runningEntry,
        cancelRequested: true,
        phase: VideoProjectExportPhase.SAVING,
      },
    })
    .mockResolvedValueOnce({
      [STORAGE_KEY]: {
        ...runningEntry,
        cancelRequested: true,
        phase: VideoProjectExportPhase.CANCELLED,
        status: 'cancelled',
      },
    });
}

function expectMonotonicLedgerWrites(): void {
  expect(browserStorageSessionSetMock).toHaveBeenNthCalledWith(1, {
    [STORAGE_KEY]: expect.objectContaining({
      cancelRequested: true,
      phase: VideoProjectExportPhase.SAVING,
      progress: 80,
      status: 'running',
    }),
  });
  expect(browserStorageSessionSetMock).toHaveBeenNthCalledWith(2, {
    [STORAGE_KEY]: expect.objectContaining({
      cancelRequested: true,
      phase: VideoProjectExportPhase.CANCELLED,
      progress: 80,
      status: 'cancelled',
    }),
  });
  expect(browserStorageSessionSetMock).toHaveBeenCalledTimes(2);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  browserStorageSessionIsAvailableMock.mockReturnValue(true);
  browserStorageSessionGetMock.mockResolvedValue({});
  browserStorageSessionRemoveMock.mockResolvedValue(undefined);
  browserStorageSessionSetMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('writes running export metadata without media payloads', async () => {
  const { upsertProjectExportJobLedgerEntry } = await import('./index');

  await upsertProjectExportJobLedgerEntry({ jobId: 'job-1', projectId: 'project-1' });

  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [STORAGE_KEY]: {
      jobId: 'job-1',
      ownerDocumentId: null,
      ownerSenderUrl: null,
      projectId: 'project-1',
      phase: VideoProjectExportPhase.PREPARING,
      progress: 0,
      status: 'running',
      startedAt: 1000,
      updatedAt: 1000,
      cancelRequested: false,
      terminalError: null,
    },
  });
});

it('returns metadata without writing when session storage is unavailable', async () => {
  const { upsertProjectExportJobLedgerEntry } = await import('./index');
  browserStorageSessionIsAvailableMock.mockReturnValue(false);

  await expect(
    upsertProjectExportJobLedgerEntry({ jobId: 'job-1', projectId: 'project-1' })
  ).resolves.toEqual(expect.objectContaining({ jobId: 'job-1', status: 'running' }));
  expect(browserStorageSessionSetMock).not.toHaveBeenCalled();
});

it('distinguishes absent, unavailable, and invalid durable ledger state', async () => {
  const { inspectActiveProjectExportJobLedgerEntry } = await import('./index');

  await expect(inspectActiveProjectExportJobLedgerEntry()).resolves.toEqual({
    status: 'absent',
  });
  browserStorageSessionIsAvailableMock.mockReturnValueOnce(false);
  await expect(inspectActiveProjectExportJobLedgerEntry()).resolves.toEqual({
    status: 'unavailable',
  });
  browserStorageSessionGetMock.mockResolvedValueOnce({ [STORAGE_KEY]: { status: 'running' } });
  await expect(inspectActiveProjectExportJobLedgerEntry()).resolves.toEqual({
    status: 'invalid',
  });
});

it('updates progress and preserves the original start timestamp', async () => {
  const { upsertProjectExportJobLedgerEntry } = await import('./index');

  browserStorageSessionGetMock.mockResolvedValueOnce({
    [STORAGE_KEY]: {
      jobId: 'job-1',
      ownerDocumentId: null,
      ownerSenderUrl: null,
      projectId: 'project-1',
      phase: VideoProjectExportPhase.PREPARING,
      progress: 0,
      status: 'running',
      startedAt: 500,
      updatedAt: 500,
      cancelRequested: false,
      terminalError: null,
    },
  });

  await upsertProjectExportJobLedgerEntry({
    jobId: 'job-1',
    projectId: 'project-1',
    phase: VideoProjectExportPhase.RENDERING,
    progress: 40,
  });

  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [STORAGE_KEY]: expect.objectContaining({
      phase: VideoProjectExportPhase.RENDERING,
      progress: 40,
      startedAt: 500,
      updatedAt: 1000,
    }),
  });
});

it('keeps export ledger progress, phase, cancellation, and terminal status monotonic', async () => {
  const {
    markProjectExportJobTerminal,
    requestProjectExportJobCancel,
    upsertProjectExportJobLedgerEntry,
  } = await import('./index');
  mockMonotonicLedgerReads();

  await requestProjectExportJobCancel('job-1');
  await markProjectExportJobTerminal('job-1', 'cancelled');
  await upsertProjectExportJobLedgerEntry({
    jobId: 'job-1',
    projectId: 'project-1',
    phase: VideoProjectExportPhase.RENDERING,
    progress: 20,
  });

  expectMonotonicLedgerWrites();
});

it('does not let completed terminal state override requested cancellation', async () => {
  const { markProjectExportJobTerminal } = await import('./index');
  const entry = {
    ...createRunningLedgerEntry(),
    cancelRequested: true,
  };
  browserStorageSessionGetMock.mockResolvedValueOnce({ [STORAGE_KEY]: entry });

  await expect(markProjectExportJobTerminal('job-1', 'completed')).resolves.toEqual(
    expect.objectContaining({
      cancelRequested: true,
      phase: VideoProjectExportPhase.CANCELLED,
      progress: 80,
      status: 'cancelled',
    })
  );

  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [STORAGE_KEY]: expect.objectContaining({
      cancelRequested: true,
      phase: VideoProjectExportPhase.CANCELLED,
      progress: 80,
      status: 'cancelled',
    }),
  });
});

it('marks active jobs terminal and clears only the matching ledger entry', async () => {
  const {
    clearProjectExportJobLedgerEntry,
    markProjectExportJobTerminal,
    requestProjectExportJobCancel,
  } = await import('./index');
  const entry = {
    jobId: 'job-1',
    projectId: 'project-1',
    phase: VideoProjectExportPhase.SAVING,
    progress: 90,
    status: 'running',
    startedAt: 500,
    updatedAt: 700,
    cancelRequested: false,
    terminalError: null,
  };

  browserStorageSessionGetMock
    .mockResolvedValueOnce({ [STORAGE_KEY]: entry })
    .mockResolvedValueOnce({ [STORAGE_KEY]: entry })
    .mockResolvedValueOnce({ [STORAGE_KEY]: { ...entry, jobId: 'job-2' } });

  await requestProjectExportJobCancel('job-1');
  await markProjectExportJobTerminal('job-1', 'failed', 'interrupted');
  await clearProjectExportJobLedgerEntry('job-1');

  expect(browserStorageSessionSetMock).toHaveBeenNthCalledWith(1, {
    [STORAGE_KEY]: expect.objectContaining({ cancelRequested: true }),
  });
  expect(browserStorageSessionSetMock).toHaveBeenNthCalledWith(2, {
    [STORAGE_KEY]: expect.objectContaining({
      status: 'failed',
      terminalError: 'interrupted',
    }),
  });
  expect(browserStorageSessionRemoveMock).not.toHaveBeenCalled();
});
