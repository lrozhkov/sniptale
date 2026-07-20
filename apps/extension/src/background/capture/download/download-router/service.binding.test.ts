import { beforeEach, expect, it, vi } from 'vitest';

const {
  db,
  dbRecords,
  getRegisteredListener,
  searchMock,
  subscribeToChangedMock,
  unsubscribeMock,
} = vi.hoisted(() => {
  let listener: ((delta: { id?: number | null; state?: { current?: string } }) => void) | undefined;
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
      return unsubscribeMock;
    }),
    unsubscribeMock: vi.fn(),
  };
});

vi.mock('@sniptale/platform/browser/downloads', () => ({
  BrowserDownloadsAdapter: undefined,
  browserDownloads: {
    search: searchMock,
    subscribeToChanged: subscribeToChangedMock,
  },
}));

vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', () => ({
  initDB: vi.fn(async () => db),
}));

vi.mock('../save-directory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../save-directory')>()),
  setLastSaveAsDirectory: vi.fn(),
}));

import {
  clearCaptureJobsForTests,
  createCaptureJob,
  readCaptureJob,
  transitionCaptureJob,
} from '../../jobs/state-machine';
import { createDownloadRouterService } from './service';

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  dbRecords.clear();
  vi.clearAllMocks();
  searchMock.mockResolvedValue([]);
  await clearCaptureJobsForTests();
});

async function createRenderingJob(): Promise<string> {
  const job = await createCaptureJob(42);
  await transitionCaptureJob(job.jobId, 'capturing');
  await transitionCaptureJob(job.jobId, 'rendering');
  return job.jobId;
}

it('fails the capture job and rejects when download binding is not durable', async () => {
  const service = createDownloadRouterService();
  const createdJob = await createCaptureJob(42);
  const onTerminal = vi.fn();

  await expect(
    service.rememberPendingDownload(29, onTerminal, 'generic', createdJob.jobId)
  ).rejects.toThrow('Invalid capture job transition created -> exporting');
  getRegisteredListener()?.({ id: 29, state: { current: 'complete' } });
  await flushPromises();

  expect(onTerminal).not.toHaveBeenCalled();
  expect(unsubscribeMock).not.toHaveBeenCalled();
  await expect(readCaptureJob(createdJob.jobId)).resolves.toEqual(
    expect.objectContaining({
      error: 'Invalid capture job transition created -> exporting',
      state: 'failed',
    })
  );
});

it('reconciles a terminal download after durable job binding', async () => {
  const service = createDownloadRouterService();
  const jobId = await createRenderingJob();
  const onTerminal = vi.fn();
  searchMock.mockResolvedValue([{ id: 30, state: 'complete' }]);

  await service.rememberPendingDownload(30, onTerminal, 'generic', jobId);
  await flushPromises();

  expect(onTerminal).toHaveBeenCalledWith('complete');
  await expect(readCaptureJob(jobId)).resolves.toEqual(
    expect.objectContaining({ downloadId: 30, state: 'completed' })
  );
});

it('fails stale save-as jobs when an older dialog returns after a newer generation starts', async () => {
  const service = createDownloadRouterService();
  const oldJobId = await createRenderingJob();
  const newJobId = await createRenderingJob();
  const oldAttempt = service.beginSaveAsDownloadAttempt(oldJobId);
  service.beginSaveAsDownloadAttempt(newJobId);

  await oldAttempt.register(31);

  await expect(readCaptureJob(oldJobId)).resolves.toEqual(
    expect.objectContaining({ error: 'Download replaced', state: 'failed' })
  );
  await expect(readCaptureJob(newJobId)).resolves.toEqual(
    expect.objectContaining({ state: 'rendering' })
  );
});
