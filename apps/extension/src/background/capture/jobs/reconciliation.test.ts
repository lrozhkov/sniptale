import { beforeEach, describe, expect, it, vi } from 'vitest';

type IndexedDbStateRecord = {
  domain: string;
  key: string;
  updatedAtEpochMs: number;
  value: unknown;
};

const dbMocks = vi.hoisted(() => {
  const records = new Map<string, IndexedDbStateRecord>();
  const keyFor = (domain: string, key: string) => `${domain}\u0000${key}`;

  return {
    db: {
      delete: vi.fn(async (_store: string, key: [string, string]) => {
        records.delete(keyFor(key[0], key[1]));
      }),
      get: vi.fn(async (_store: string, key: [string, string]) =>
        records.get(keyFor(key[0], key[1]))
      ),
      getAllFromIndex: vi.fn(async (_store: string, _indexName: string, domain: string) =>
        [...records.values()].filter((record) => record.domain === domain)
      ),
      put: vi.fn(async (_store: string, record: IndexedDbStateRecord) => {
        records.set(keyFor(record.domain, record.key), record);
      }),
    },
    records,
  };
});
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', () => ({
  initDB: vi.fn(async () => dbMocks.db),
}));
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: loggerWarnMock }),
}));

import {
  CAPTURE_JOB_DOMAIN,
  clearCaptureJobsForTests,
  createCaptureJob,
  readCaptureJob,
  type CaptureJobRecord,
} from './state-machine';
import { reconcileCaptureJobsOnStartup } from './reconciliation';
import { stateManager } from '../../../composition/persistence/infrastructure/state-manager';

const NOW_EPOCH_MS = 1_800_000_000_000;
const OLD_TERMINAL_EPOCH_MS = NOW_EPOCH_MS - 25 * 60 * 60 * 1000;
const PREVIOUS_WORKER_GENERATION = 'previous-worker';

async function writePersistedJob(
  job: Pick<CaptureJobRecord, 'jobId' | 'revision' | 'state' | 'tabId' | 'updatedAtEpochMs'> &
    Partial<CaptureJobRecord>
): Promise<void> {
  await stateManager.write(CAPTURE_JOB_DOMAIN, job.jobId, {
    runtimeGeneration: PREVIOUS_WORKER_GENERATION,
    ...job,
  });
}

function expectCleanupTabs(cleanupInterruptedCapture: ReturnType<typeof vi.fn>, tabIds: number[]) {
  expect(cleanupInterruptedCapture).toHaveBeenCalledTimes(tabIds.length);
  tabIds.forEach((tabId, index) => {
    expect(cleanupInterruptedCapture).toHaveBeenNthCalledWith(index + 1, tabId);
  });
}

beforeEach(async () => {
  dbMocks.records.clear();
  vi.clearAllMocks();
  await clearCaptureJobsForTests();
});

describe('capture job startup active reconciliation', () => {
  it('fails non-resumable active jobs after service-worker restart', async () => {
    const cleanupInterruptedCapture = vi.fn().mockResolvedValue(undefined);
    const reconcileExportingDownload = vi.fn();
    await writePersistedJob({
      jobId: 'created-job',
      revision: 0,
      state: 'created',
      tabId: 1,
      updatedAtEpochMs: NOW_EPOCH_MS - 1000,
    });
    await writePersistedJob({
      jobId: 'capturing-job',
      revision: 1,
      state: 'capturing',
      tabId: 2,
      updatedAtEpochMs: NOW_EPOCH_MS - 1000,
    });
    await writePersistedJob({
      jobId: 'rendering-job',
      revision: 2,
      state: 'rendering',
      tabId: 3,
      updatedAtEpochMs: NOW_EPOCH_MS - 1000,
    });

    await expect(
      reconcileCaptureJobsOnStartup({
        cleanupInterruptedCapture,
        nowEpochMs: NOW_EPOCH_MS,
        reconcileExportingDownload,
      })
    ).resolves.toEqual({ activeFailed: 3, downloadsReconciled: 0, staleRemoved: 0 });

    expectCleanupTabs(cleanupInterruptedCapture, [1, 2, 3]);
    await expect(readCaptureJob('created-job')).resolves.toEqual(
      expect.objectContaining({
        error: 'Capture job interrupted by service worker restart',
        state: 'failed',
      })
    );
    await expect(readCaptureJob('capturing-job')).resolves.toEqual(
      expect.objectContaining({ state: 'failed' })
    );
    await expect(readCaptureJob('rendering-job')).resolves.toEqual(
      expect.objectContaining({ state: 'failed' })
    );
    expect(reconcileExportingDownload).not.toHaveBeenCalled();
  });
});

describe('capture job startup active cleanup failure', () => {
  it('keeps failing interrupted jobs when startup page cleanup fails', async () => {
    const cleanupInterruptedCapture = vi.fn().mockRejectedValue(new Error('tab navigated'));
    const reconcileExportingDownload = vi.fn();
    await writePersistedJob({
      jobId: 'capturing-job',
      revision: 1,
      state: 'capturing',
      tabId: 2,
      updatedAtEpochMs: NOW_EPOCH_MS - 1000,
    });

    await expect(
      reconcileCaptureJobsOnStartup({
        cleanupInterruptedCapture,
        nowEpochMs: NOW_EPOCH_MS,
        reconcileExportingDownload,
      })
    ).resolves.toEqual({ activeFailed: 1, downloadsReconciled: 0, staleRemoved: 0 });

    expectCleanupTabs(cleanupInterruptedCapture, [2]);
    await expect(readCaptureJob('capturing-job')).resolves.toEqual(
      expect.objectContaining({ state: 'failed' })
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Failed to clean up interrupted capture job on startup',
      expect.objectContaining({ jobId: 'capturing-job', tabId: 2 })
    );
  });
});

describe('capture job startup download reconciliation', () => {
  it('reconciles exporting jobs through the download owner', async () => {
    const cleanupInterruptedCapture = vi.fn().mockResolvedValue(undefined);
    const reconcileExportingDownload = vi.fn().mockResolvedValue('rebound');
    await writePersistedJob({
      downloadId: 41,
      jobId: 'exporting-job',
      revision: 3,
      state: 'exporting',
      tabId: 4,
      updatedAtEpochMs: Date.now(),
    });

    await expect(
      reconcileCaptureJobsOnStartup({
        cleanupInterruptedCapture,
        nowEpochMs: Date.now(),
        reconcileExportingDownload,
      })
    ).resolves.toEqual({ activeFailed: 0, downloadsReconciled: 1, staleRemoved: 0 });

    expect(cleanupInterruptedCapture).not.toHaveBeenCalled();
    expect(reconcileExportingDownload).toHaveBeenCalledWith(
      expect.objectContaining({ downloadId: 41, jobId: 'exporting-job', state: 'exporting' })
    );
    await expect(readCaptureJob('exporting-job')).resolves.toEqual(
      expect.objectContaining({ downloadId: 41, state: 'exporting' })
    );
  });
});

describe('capture job startup download failure reconciliation', () => {
  it('fails exporting jobs when the persisted download binding is missing', async () => {
    const cleanupInterruptedCapture = vi.fn().mockResolvedValue(undefined);
    const reconcileExportingDownload = vi.fn();
    await writePersistedJob({
      jobId: 'missing-download-export',
      revision: 3,
      state: 'exporting',
      tabId: 5,
      updatedAtEpochMs: Date.now(),
    });

    await expect(
      reconcileCaptureJobsOnStartup({
        cleanupInterruptedCapture,
        nowEpochMs: Date.now(),
        reconcileExportingDownload,
      })
    ).resolves.toEqual({ activeFailed: 1, downloadsReconciled: 0, staleRemoved: 0 });

    expect(cleanupInterruptedCapture).not.toHaveBeenCalled();
    expect(reconcileExportingDownload).not.toHaveBeenCalled();
    await expect(readCaptureJob('missing-download-export')).resolves.toEqual(
      expect.objectContaining({
        error: 'Capture download could not be reconciled after restart',
        state: 'failed',
      })
    );
  });
});

describe('capture job startup current-worker fence', () => {
  it('does not fail jobs created by the current worker while startup reconciliation is running', async () => {
    const cleanupInterruptedCapture = vi.fn().mockResolvedValue(undefined);
    const liveJob = await createCaptureJob(6);
    const reconcileExportingDownload = vi.fn();

    await expect(
      reconcileCaptureJobsOnStartup({
        cleanupInterruptedCapture,
        nowEpochMs: NOW_EPOCH_MS,
        reconcileExportingDownload,
      })
    ).resolves.toEqual({ activeFailed: 0, downloadsReconciled: 0, staleRemoved: 0 });

    await expect(readCaptureJob(liveJob.jobId)).resolves.toEqual(
      expect.objectContaining({ jobId: liveJob.jobId, state: 'created' })
    );
    expect(cleanupInterruptedCapture).not.toHaveBeenCalled();
    expect(reconcileExportingDownload).not.toHaveBeenCalled();
  });
});

describe('capture job startup storage cleanup', () => {
  it('removes malformed jobs and expired terminal jobs during startup maintenance', async () => {
    const cleanupInterruptedCapture = vi.fn().mockResolvedValue(undefined);
    const reconcileExportingDownload = vi.fn();
    await stateManager.write(CAPTURE_JOB_DOMAIN, 'malformed', {
      jobId: 'malformed',
      revision: 0,
      state: 'not-a-state',
      tabId: 5,
      updatedAtEpochMs: NOW_EPOCH_MS,
    });
    await writePersistedJob({
      error: 'old failure',
      jobId: 'old-terminal',
      revision: 1,
      state: 'failed',
      tabId: 6,
      terminalAtEpochMs: OLD_TERMINAL_EPOCH_MS,
      updatedAtEpochMs: OLD_TERMINAL_EPOCH_MS,
    });

    await expect(
      reconcileCaptureJobsOnStartup({
        cleanupInterruptedCapture,
        nowEpochMs: NOW_EPOCH_MS,
        reconcileExportingDownload,
      })
    ).resolves.toEqual({ activeFailed: 0, downloadsReconciled: 0, staleRemoved: 1 });

    expect(cleanupInterruptedCapture).not.toHaveBeenCalled();
    await expect(readCaptureJob('malformed')).resolves.toBeUndefined();
    await expect(readCaptureJob('old-terminal')).resolves.toBeUndefined();
  });
});
