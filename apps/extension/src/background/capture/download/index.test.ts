import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { browserDownloadsDownloadMock, browserDownloadsSubscribeMock, db, dbRecords } = vi.hoisted(
  () => {
    const records = new Map<string, unknown>();
    const keyFor = (domain: string, key: string) => `${domain}\u0000${key}`;

    return {
      browserDownloadsDownloadMock: vi.fn(),
      browserDownloadsSubscribeMock: vi.fn(() => vi.fn()),
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
    };
  }
);

vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', () => ({
  initDB: vi.fn(async () => db),
}));

vi.mock('@sniptale/platform/browser/downloads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/downloads')>()),
  browserDownloads: {
    download: browserDownloadsDownloadMock,
    subscribeToChanged: browserDownloadsSubscribeMock,
  },
}));

import { blobToDataURL, downloadImageInServiceWorker, loadImage } from './index';
import {
  clearCaptureJobsForTests,
  createCaptureJob,
  readCaptureJob,
  transitionCaptureJob,
} from '../jobs/state-machine';

function resetDownloadMocks() {
  dbRecords.clear();
  vi.clearAllMocks();
  browserDownloadsSubscribeMock.mockReturnValue(vi.fn());
  return clearCaptureJobsForTests();
}

async function createRenderingJob(): Promise<string> {
  const job = await createCaptureJob(42);
  await transitionCaptureJob(job.jobId, 'capturing');
  await transitionCaptureJob(job.jobId, 'rendering');
  return job.jobId;
}

function restoreDownloadGlobals() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

describe('capture-download conversion helpers', () => {
  beforeEach(() => {
    resetDownloadMocks();
  });

  afterEach(() => {
    restoreDownloadGlobals();
  });

  it('converts blobs to data URLs', verifyBlobToDataUrlSuccess);
  it('rejects when FileReader fails', verifyBlobToDataUrlFailure);
  it('loads an image bitmap from a data URL', verifyLoadImageBitmap);
});

class SuccessfulFileReader {
  public result: string | ArrayBuffer | null = 'data:image/png;base64,blob';
  public onloadend: (() => void) | null = null;
  public onerror: ((error: unknown) => void) | null = null;

  readAsDataURL() {
    this.onloadend?.();
  }
}

async function verifyBlobToDataUrlSuccess(): Promise<void> {
  vi.stubGlobal('FileReader', SuccessfulFileReader);

  await expect(blobToDataURL(new Blob(['ok'], { type: 'text/plain' }))).resolves.toBe(
    'data:image/png;base64,blob'
  );
}

function createFailingFileReader(readerError: Error) {
  return class FailingFileReader {
    public result: string | ArrayBuffer | null = null;
    public onloadend: (() => void) | null = null;
    public onerror: ((error: unknown) => void) | null = null;

    readAsDataURL() {
      this.onerror?.(readerError);
    }
  };
}

async function verifyBlobToDataUrlFailure(): Promise<void> {
  const readerError = new Error('read failed');

  vi.stubGlobal('FileReader', createFailingFileReader(readerError));

  await expect(blobToDataURL(new Blob(['fail']))).rejects.toBe(readerError);
}

async function verifyLoadImageBitmap(): Promise<void> {
  const blob = new Blob(['image-bytes'], { type: 'image/png' });
  const imageBitmap = { width: 12, height: 8 } as ImageBitmap;
  const fetchMock = vi.fn().mockResolvedValue({
    blob: vi.fn().mockResolvedValue(blob),
  });
  const createImageBitmapMock = vi.fn().mockResolvedValue(imageBitmap);

  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('createImageBitmap', createImageBitmapMock);

  await expect(loadImage('data:image/png;base64,abc')).resolves.toBe(imageBitmap);
  expect(fetchMock).toHaveBeenCalledWith('data:image/png;base64,abc');
  expect(createImageBitmapMock).toHaveBeenCalledWith(blob);
}

describe('capture-download worker download', () => {
  beforeEach(() => {
    return resetDownloadMocks();
  });

  afterEach(() => {
    restoreDownloadGlobals();
  });

  it('downloads an image through the shared downloads adapter', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    browserDownloadsDownloadMock.mockResolvedValue(9);

    await downloadImageInServiceWorker('data:image/png;base64,1', 'capture.png');

    expect(browserDownloadsDownloadMock).toHaveBeenCalledWith({
      url: 'data:image/png;base64,1',
      filename: 'capture.png',
      saveAs: false,
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[BackgroundCapture]',
      'Screenshot saved',
      'capture.png'
    );
  });
});

describe('capture-download worker job binding', () => {
  beforeEach(() => {
    return resetDownloadMocks();
  });

  afterEach(() => {
    restoreDownloadGlobals();
  });

  it('marks a bound capture job failed when download startup rejects', async () => {
    const jobId = await createRenderingJob();
    browserDownloadsDownloadMock.mockRejectedValue(new Error('download startup failed'));

    await expect(
      downloadImageInServiceWorker('data:image/png;base64,1', 'capture.png', jobId)
    ).rejects.toThrow('download startup failed');

    await expect(readCaptureJob(jobId)).resolves.toEqual(
      expect.objectContaining({ state: 'failed', error: 'download startup failed' })
    );
  });

  it('tracks bound capture downloads by returned download id', async () => {
    const jobId = await createRenderingJob();
    browserDownloadsDownloadMock.mockResolvedValue(14);

    await downloadImageInServiceWorker('data:image/png;base64,1', 'capture.png', jobId);

    expect(browserDownloadsSubscribeMock).toHaveBeenCalled();
    await vi.waitFor(async () => {
      await expect(readCaptureJob(jobId)).resolves.toEqual(
        expect.objectContaining({ downloadId: 14, state: 'exporting' })
      );
    });
  });

  it('marks a bound capture job failed when no download id is returned', async () => {
    const jobId = await createRenderingJob();
    browserDownloadsDownloadMock.mockResolvedValue(undefined);

    await downloadImageInServiceWorker('data:image/png;base64,1', 'capture.png', jobId);

    await expect(readCaptureJob(jobId)).resolves.toEqual(
      expect.objectContaining({ state: 'failed', error: 'Download did not return an id' })
    );
  });
});
