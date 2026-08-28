import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cancelMock, db, dbRecords, getRegisteredListener, searchMock, subscribeToChangedMock } =
  vi.hoisted(() => {
    let listener:
      | ((delta: { id?: number | null; state?: { current?: string } }) => void)
      | undefined;
    const records = new Map<string, unknown>();
    const keyFor = (domain: string, key: string) => `${domain}\u0000${key}`;

    return {
      cancelMock: vi.fn(),
      db: {
        delete: vi.fn(async (_store: string, key: [string, string]) => {
          records.delete(keyFor(key[0], key[1]));
        }),
        get: vi.fn(async (_store: string, key: [string, string]) =>
          records.get(keyFor(key[0], key[1]))
        ),
        getAllFromIndex: vi.fn(async (_store: string, _indexName: string, domain: string) =>
          [...records.values()].filter(
            (record) =>
              Boolean(record) &&
              typeof record === 'object' &&
              (record as { domain?: unknown }).domain === domain
          )
        ),
        put: vi.fn(async (_store: string, record: { domain: string; key: string }) => {
          records.set(keyFor(record.domain, record.key), record);
        }),
      },
      dbRecords: records,
      getRegisteredListener: () => listener,
      searchMock: vi.fn(),
      subscribeToChangedMock: vi.fn((callback) => {
        listener = callback as typeof listener;
        return vi.fn();
      }),
    };
  });

vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', () => ({
  initDB: vi.fn(async () => db),
}));

vi.mock('@sniptale/platform/browser/downloads', () => ({
  BrowserDownloadsAdapter: undefined,
  browserDownloads: {
    cancel: cancelMock,
    search: searchMock,
    subscribeToChanged: subscribeToChangedMock,
  },
}));

vi.mock('../save-directory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../save-directory')>()),
  setLastSaveAsDirectory: vi.fn(),
}));

import { createDownloadRouterService } from './service';
import {
  clearCaptureJobsForTests,
  createCaptureJob,
  readCaptureJob,
  transitionCaptureJob,
} from '../../jobs/state-machine';

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function createExportingJob(downloadId: number): Promise<string> {
  const job = await createCaptureJob(42);
  await transitionCaptureJob(job.jobId, 'capturing');
  await transitionCaptureJob(job.jobId, 'rendering');
  await transitionCaptureJob(job.jobId, 'exporting', { downloadId });
  return job.jobId;
}

beforeEach(async () => {
  dbRecords.clear();
  vi.clearAllMocks();
  await clearCaptureJobsForTests();
});

describe('download-router service restart reconciliation', () => {
  it('reconciles an already completed capture download after service-worker restart', async () => {
    const service = createDownloadRouterService();
    const jobId = await createExportingJob(27);
    searchMock.mockResolvedValueOnce([{ id: 27, state: 'complete' }]);

    await expect(service.reconcileCaptureJobDownload(27, jobId)).resolves.toBe('completed');

    await expect(readCaptureJob(jobId)).resolves.toEqual(
      expect.objectContaining({ downloadId: 27, state: 'completed' })
    );
  });

  it('rebinds an in-progress capture download after service-worker restart', async () => {
    const service = createDownloadRouterService();
    const jobId = await createExportingJob(28);
    searchMock.mockResolvedValueOnce([{ id: 28, state: 'in_progress' }]);

    await expect(service.reconcileCaptureJobDownload(28, jobId)).resolves.toBe('rebound');
    getRegisteredListener()?.({ id: 28, state: { current: 'interrupted' } });
    await flushPromises();

    await expect(readCaptureJob(jobId)).resolves.toEqual(
      expect.objectContaining({ downloadId: 28, state: 'failed', error: 'Download interrupted' })
    );
  });

  it('finds only the exact persisted lease URL inside the recovery window', async () => {
    const service = createDownloadRouterService();
    searchMock.mockResolvedValueOnce([
      { id: 31, state: 'in_progress', url: 'blob:other' },
      { id: 32, state: 'complete', finalUrl: 'blob:lease', url: 'blob:redirected' },
    ]);

    await expect(
      service.findDownloadsByExactUrl({ requestedAt: 2_000, url: 'blob:lease' })
    ).resolves.toEqual([{ downloadId: 32, state: 'complete' }]);
    expect(searchMock).toHaveBeenCalledWith({
      startedAfter: new Date(1_000).toISOString(),
      startedBefore: new Date(32_000).toISOString(),
    });
  });

  it('cancels through the platform owner and waits for an interrupted terminal state', async () => {
    const service = createDownloadRouterService();
    searchMock
      .mockResolvedValueOnce([{ id: 33, state: 'in_progress' }])
      .mockResolvedValueOnce([{ id: 33, state: 'in_progress' }])
      .mockResolvedValueOnce([{ id: 33, state: 'in_progress' }])
      .mockResolvedValueOnce([{ id: 33, state: 'interrupted' }]);
    cancelMock.mockResolvedValueOnce(undefined);

    await expect(service.cancelDownloadAndWait(33)).resolves.toBe('interrupted');
    expect(cancelMock).toHaveBeenCalledWith(33);
  });

  it('settles a terminal state observed immediately before cancellation without an event', async () => {
    const service = createDownloadRouterService();
    searchMock
      .mockResolvedValueOnce([{ id: 34, state: 'in_progress' }])
      .mockResolvedValueOnce([{ id: 34, state: 'in_progress' }])
      .mockResolvedValueOnce([{ id: 34, state: 'complete' }]);

    await expect(service.cancelDownloadAndWait(34)).resolves.toBe('complete');
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('rejects timeout because it is not an authoritative browser terminal state', async () => {
    vi.useFakeTimers();
    try {
      const service = createDownloadRouterService({ terminalTimeoutMs: 1 });
      searchMock.mockResolvedValue([{ id: 35, state: 'in_progress' }]);
      cancelMock.mockResolvedValueOnce(undefined);
      const cancellation = service.cancelDownloadAndWait(35);
      const assertion = expect(cancellation).rejects.toThrow('did not reach a browser terminal');
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
