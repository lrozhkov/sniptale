import { beforeEach, expect, it, vi } from 'vitest';

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

import { stateManager } from '../../../composition/persistence/infrastructure/state-manager';
import { reconcileCaptureJobsOnStartup } from './reconciliation';
import {
  CAPTURE_JOB_DOMAIN,
  clearCaptureJobsForTests,
  createCaptureJob,
  readCaptureJob,
  type CaptureJobRecord,
} from './state-machine';

const NOW_EPOCH_MS = 1_800_000_000_000;
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForCleanupCall(cleanupInterruptedCapture: ReturnType<typeof vi.fn>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (cleanupInterruptedCapture.mock.calls.length > 0) {
      return;
    }
    await flushMicrotasks();
  }
}

beforeEach(async () => {
  dbMocks.records.clear();
  vi.clearAllMocks();
  await clearCaptureJobsForTests();
});

it('skips stale startup cleanup when the same tab has a current capture job', async () => {
  const cleanupInterruptedCapture = vi.fn().mockResolvedValue(undefined);
  const reconcileExportingDownload = vi.fn();
  await writePersistedJob({
    jobId: 'previous-capturing-job',
    revision: 1,
    state: 'capturing',
    tabId: 5,
    updatedAtEpochMs: NOW_EPOCH_MS - 1000,
  });
  const currentJob = await createCaptureJob(5);

  await expect(
    reconcileCaptureJobsOnStartup({
      cleanupInterruptedCapture,
      nowEpochMs: NOW_EPOCH_MS,
      reconcileExportingDownload,
    })
  ).resolves.toEqual({ activeFailed: 1, downloadsReconciled: 0, staleRemoved: 0 });

  expect(cleanupInterruptedCapture).not.toHaveBeenCalled();
  await expect(readCaptureJob('previous-capturing-job')).resolves.toEqual(
    expect.objectContaining({ state: 'failed' })
  );
  await expect(readCaptureJob(currentJob.jobId)).resolves.toEqual(
    expect.objectContaining({ state: 'created' })
  );
});

it('keeps same-tab capture creation behind startup cleanup already in progress', async () => {
  const cleanup = createDeferred<void>();
  const cleanupInterruptedCapture = vi.fn().mockReturnValue(cleanup.promise);
  const reconcileExportingDownload = vi.fn();
  await writePersistedJob({
    jobId: 'previous-rendering-job',
    revision: 2,
    state: 'rendering',
    tabId: 5,
    updatedAtEpochMs: NOW_EPOCH_MS - 1000,
  });

  const reconcilePromise = reconcileCaptureJobsOnStartup({
    cleanupInterruptedCapture,
    nowEpochMs: NOW_EPOCH_MS,
    reconcileExportingDownload,
  });
  await waitForCleanupCall(cleanupInterruptedCapture);
  let captureCreated = false;
  const createPromise = createCaptureJob(5).then((job) => {
    captureCreated = true;
    return job;
  });
  await flushMicrotasks();

  expect(cleanupInterruptedCapture).toHaveBeenCalledWith(5);
  expect(captureCreated).toBe(false);
  cleanup.resolve();
  await expect(createPromise).resolves.toEqual(expect.objectContaining({ tabId: 5 }));
  await expect(reconcilePromise).resolves.toEqual({
    activeFailed: 1,
    downloadsReconciled: 0,
    staleRemoved: 0,
  });
});
