import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  db,
  dbRecords,
  searchMock,
  setLastSaveAsDirectoryMock,
  subscribeToChangedMock,
  unsubscribeMock,
  getRegisteredListener,
} = vi.hoisted(() => {
  let listener: ((delta: { id?: number | null; state?: { current?: string } }) => void) | undefined;
  const unsubscribeMock = vi.fn();
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
    searchMock: vi.fn(),
    setLastSaveAsDirectoryMock: vi.fn(),
    subscribeToChangedMock: vi.fn((callback) => {
      listener = callback as typeof listener;
      return unsubscribeMock;
    }),
    unsubscribeMock,
    getRegisteredListener: () => listener,
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
  setLastSaveAsDirectory: setLastSaveAsDirectoryMock,
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  dbRecords.clear();
  vi.clearAllMocks();
  return clearCaptureJobsForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

async function createRenderingJob(): Promise<string> {
  const job = await createCaptureJob(42);
  await transitionCaptureJob(job.jobId, 'capturing');
  await transitionCaptureJob(job.jobId, 'rendering');
  return job.jobId;
}

describe('download-router service', () => {
  it('does not subscribe when no pending save-as download is tracked', () => {
    const service = createDownloadRouterService();

    service.rememberPendingSaveAsDownload(null);

    expect(subscribeToChangedMock).not.toHaveBeenCalled();
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it('persists a relative directory after the tracked save-as download completes', async () => {
    const service = createDownloadRouterService();

    service.rememberPendingSaveAsDownload(11);
    searchMock.mockResolvedValue([{ filename: 'nested/output/capture.png' }]);

    getRegisteredListener()?.({
      id: 11,
      state: { current: 'complete' },
    });

    await flushPromises();

    expect(subscribeToChangedMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith({ id: 11 });
    expect(setLastSaveAsDirectoryMock).toHaveBeenCalledWith('nested/output');
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('clears the tracked save-as download when it is interrupted', async () => {
    const service = createDownloadRouterService();

    service.rememberPendingSaveAsDownload(12);
    getRegisteredListener()?.({
      id: 12,
      state: { current: 'interrupted' },
    });
    await flushPromises();

    expect(searchMock).not.toHaveBeenCalled();
    expect(setLastSaveAsDirectoryMock).not.toHaveBeenCalled();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});

describe('download-router capture job lifecycle tracking', () => {
  it('marks a bound capture job completed when the download completes', async () => {
    const service = createDownloadRouterService();
    const jobId = await createRenderingJob();

    await service.rememberPendingDownload(24, vi.fn(), 'generic', jobId);
    getRegisteredListener()?.({ id: 24, state: { current: 'complete' } });
    await flushPromises();

    await expect(readCaptureJob(jobId)).resolves.toEqual(
      expect.objectContaining({ downloadId: 24, state: 'completed' })
    );
  });

  it('marks a bound capture job failed when the download is interrupted', async () => {
    const service = createDownloadRouterService();
    const jobId = await createRenderingJob();

    await service.rememberPendingDownload(25, vi.fn(), 'generic', jobId);
    getRegisteredListener()?.({ id: 25, state: { current: 'interrupted' } });
    await flushPromises();

    await expect(readCaptureJob(jobId)).resolves.toEqual(
      expect.objectContaining({ downloadId: 25, state: 'failed', error: 'Download interrupted' })
    );
  });

  it('marks a bound capture job failed when download tracking times out', async () => {
    vi.useFakeTimers();
    const service = createDownloadRouterService({ terminalTimeoutMs: 1000 });
    const jobId = await createRenderingJob();

    await service.rememberPendingDownload(26, vi.fn(), 'generic', jobId);
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    await expect(readCaptureJob(jobId)).resolves.toEqual(
      expect.objectContaining({ downloadId: 26, state: 'failed', error: 'Download timeout' })
    );
  });
});

describe('download-router generic lifecycle tracking', () => {
  it('runs generic terminal cleanup on complete, interrupted, and timeout', async () => {
    vi.useFakeTimers();
    const service = createDownloadRouterService({ terminalTimeoutMs: 1000 });
    const onTerminal = vi.fn();

    await service.rememberPendingDownload(13, onTerminal);
    getRegisteredListener()?.({ id: 13, state: { current: 'complete' } });
    expect(onTerminal).toHaveBeenCalledWith('complete');

    await service.rememberPendingDownload(14, onTerminal);
    getRegisteredListener()?.({ id: 14, state: { current: 'interrupted' } });
    expect(onTerminal).toHaveBeenCalledWith('interrupted');

    await service.rememberPendingDownload(15, onTerminal);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onTerminal).toHaveBeenCalledWith('timeout');
  });

  it('tracks independent generic downloads without evicting earlier cleanup', async () => {
    const service = createDownloadRouterService();
    const firstTerminal = vi.fn();
    const secondTerminal = vi.fn();

    await service.rememberPendingDownload(16, firstTerminal);
    await service.rememberPendingDownload(17, secondTerminal);
    getRegisteredListener()?.({ id: 16, state: { current: 'complete' } });
    getRegisteredListener()?.({ id: 17, state: { current: 'complete' } });

    expect(firstTerminal).toHaveBeenCalledWith('complete');
    expect(secondTerminal).toHaveBeenCalledWith('complete');
  });
});

describe('download-router save-as replacement', () => {
  it('replaces stale save-as downloads without persisting old directories', async () => {
    const service = createDownloadRouterService();
    searchMock.mockResolvedValueOnce([{ filename: 'new/output/capture.png' }]);

    service.rememberPendingSaveAsDownload(18);
    service.rememberPendingSaveAsDownload(19);
    getRegisteredListener()?.({ id: 18, state: { current: 'complete' } });
    getRegisteredListener()?.({ id: 19, state: { current: 'complete' } });
    await flushPromises();

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith({ id: 19 });
    expect(setLastSaveAsDirectoryMock).toHaveBeenCalledWith('new/output');
  });

  it('fails the previous save-as capture job when a newer attempt replaces it', async () => {
    const service = createDownloadRouterService();
    const firstJobId = await createRenderingJob();
    const secondJobId = await createRenderingJob();
    const firstAttempt = service.beginSaveAsDownloadAttempt(firstJobId);
    await firstAttempt.register(27);
    const secondAttempt = service.beginSaveAsDownloadAttempt(secondJobId);
    await secondAttempt.register(28);
    await flushPromises();

    await expect(readCaptureJob(firstJobId)).resolves.toEqual(
      expect.objectContaining({ state: 'failed', error: 'Download replaced' })
    );
    await expect(readCaptureJob(secondJobId)).resolves.toEqual(
      expect.objectContaining({ downloadId: 28, state: 'exporting' })
    );
  });
});

describe('download-router save-as async persistence', () => {
  it('ignores late directory search results from older save-as completions', async () => {
    const service = createDownloadRouterService();
    const oldSearch = createDeferred<Array<{ filename: string }>>();
    const newSearch = createDeferred<Array<{ filename: string }>>();
    searchMock.mockImplementation((query: { id?: number }) =>
      query.id === 20 ? oldSearch.promise : newSearch.promise
    );

    service.rememberPendingSaveAsDownload(20);
    getRegisteredListener()?.({ id: 20, state: { current: 'complete' } });
    service.rememberPendingSaveAsDownload(21);
    getRegisteredListener()?.({ id: 21, state: { current: 'complete' } });
    newSearch.resolve([{ filename: 'new/output/capture.png' }]);
    await flushPromises();
    oldSearch.resolve([{ filename: 'old/output/capture.png' }]);
    await flushPromises();

    expect(setLastSaveAsDirectoryMock).toHaveBeenCalledTimes(1);
    expect(setLastSaveAsDirectoryMock).toHaveBeenCalledWith('new/output');
  });
});
