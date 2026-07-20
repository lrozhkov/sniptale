import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, dbRecords, getRegisteredListener, searchMock, subscribeToChangedMock } = vi.hoisted(
  () => {
    let listener:
      | ((delta: { id?: number | null; state?: { current?: string } }) => void)
      | undefined;
    const records = new Map<string, unknown>();
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
  }
);

vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', () => ({
  initDB: vi.fn(async () => db),
}));

vi.mock('@sniptale/platform/browser/downloads', () => ({
  BrowserDownloadsAdapter: undefined,
  browserDownloads: {
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
});
