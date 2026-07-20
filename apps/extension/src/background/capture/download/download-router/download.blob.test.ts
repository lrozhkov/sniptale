import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  browserDownloadsDownloadMock,
  beginSaveAsDownloadAttemptMock,
  getLastSaveAsDirectoryMock,
  rememberPendingDownloadMock,
  resolvePresetPathMock,
  saveAsRegisterMock,
  transitionCaptureJobMock,
} = vi.hoisted(() => ({
  browserDownloadsDownloadMock: vi.fn(),
  beginSaveAsDownloadAttemptMock: vi.fn(),
  getLastSaveAsDirectoryMock: vi.fn(),
  rememberPendingDownloadMock: vi.fn(),
  resolvePresetPathMock: vi.fn(),
  saveAsRegisterMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/downloads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/downloads')>()),
  browserDownloads: {
    download: browserDownloadsDownloadMock,
  },
}));

vi.mock('../save-directory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../save-directory')>()),
  getLastSaveAsDirectory: getLastSaveAsDirectoryMock,
}));

vi.mock('../../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../jobs/state-machine')>()),
  transitionCaptureJob: transitionCaptureJobMock,
}));

vi.mock('./path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./path')>()),
  buildDownloadFilename: (path: string | null, filename: string) =>
    path ? `${path}/${filename}` : filename,
  resolvePresetPath: resolvePresetPathMock,
}));

vi.mock('./service-singleton', () => ({
  defaultDownloadRouterService: {
    beginSaveAsDownloadAttempt: beginSaveAsDownloadAttemptMock,
    rememberPendingDownload: rememberPendingDownloadMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  beginSaveAsDownloadAttemptMock.mockReturnValue({ register: saveAsRegisterMock });
  getLastSaveAsDirectoryMock.mockResolvedValue('last-dir');
  resolvePresetPathMock.mockResolvedValue('captures');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:download-url'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('downloads blob URLs and registers cleanup with the download router', async () => {
  const { executeDownloadBlob } = await import('./execute');
  browserDownloadsDownloadMock.mockResolvedValue(42);

  await expect(
    executeDownloadBlob(new Blob(['data']), 'capture.png', 'preset-1', 'job-1')
  ).resolves.toBe(42);

  expect(browserDownloadsDownloadMock).toHaveBeenCalledWith({
    filename: 'captures/capture.png',
    saveAs: false,
    url: 'blob:download-url',
  });
  expect(rememberPendingDownloadMock).toHaveBeenCalledWith(
    42,
    expect.any(Function),
    'generic',
    'job-1'
  );
});

it('skips non-download capture actions without touching browser downloads', async () => {
  const { executeDownload } = await import('./execute');

  await expect(
    executeDownload('data:image/png;base64,a', 'capture.png', 'copy')
  ).resolves.toBeUndefined();

  expect(browserDownloadsDownloadMock).not.toHaveBeenCalled();
});

it('registers save-as downloads and fails jobs when chrome returns no id', async () => {
  const { executeDownload } = await import('./execute');
  browserDownloadsDownloadMock.mockResolvedValue(undefined);

  await expect(
    executeDownload('data:image/png;base64,a', 'capture.png', 'ask_system', null, 'job-1')
  ).resolves.toBeUndefined();

  expect(browserDownloadsDownloadMock).toHaveBeenCalledWith({
    filename: 'last-dir/capture.png',
    saveAs: true,
    url: 'data:image/png;base64,a',
  });
  expect(saveAsRegisterMock).toHaveBeenCalledWith(undefined);
  expect(transitionCaptureJobMock).toHaveBeenCalledWith('job-1', 'failed', {
    error: 'Download did not return an id',
  });
});

it('tracks preset downloads for active capture jobs', async () => {
  const { executeDownload } = await import('./execute');
  browserDownloadsDownloadMock.mockResolvedValue(24);

  await expect(
    executeDownload(
      'data:image/png;base64,a',
      'capture.png',
      'download_default',
      'preset-1',
      'job-1'
    )
  ).resolves.toBeUndefined();

  expect(browserDownloadsDownloadMock).toHaveBeenCalledWith({
    filename: 'captures/capture.png',
    saveAs: false,
    url: 'data:image/png;base64,a',
  });
  expect(rememberPendingDownloadMock).toHaveBeenCalledWith(
    24,
    expect.any(Function),
    'generic',
    'job-1'
  );
});

it('falls back to a data URL when blob object URLs are unavailable', async () => {
  const { executeDownloadBlob } = await import('./execute');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: undefined,
  });
  browserDownloadsDownloadMock.mockResolvedValue(43);

  await expect(executeDownloadBlob(new Blob(['data']), 'capture.bin')).resolves.toBe(43);

  expect(browserDownloadsDownloadMock).toHaveBeenCalledWith({
    filename: 'captures/capture.bin',
    saveAs: false,
    url: 'data:application/octet-stream;base64,ZGF0YQ==',
  });
  expect(rememberPendingDownloadMock).not.toHaveBeenCalled();
  expect(transitionCaptureJobMock).not.toHaveBeenCalled();
});

it('rejects oversized data URL fallback blobs when object URLs are unavailable', async () => {
  const { executeDownloadBlob } = await import('./execute');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: undefined,
  });
  class OversizedBlob extends Blob {
    readonly arrayBufferMock = vi.fn<() => Promise<ArrayBuffer>>();

    override get size(): number {
      return 64 * 1024 * 1024 + 1;
    }

    override get type(): string {
      return 'video/webm';
    }

    override arrayBuffer(): Promise<ArrayBuffer> {
      return this.arrayBufferMock();
    }
  }
  const blob = new OversizedBlob();

  await expect(executeDownloadBlob(blob, 'capture.webm')).rejects.toThrow(
    'Blob download fallback payload exceeds background data URL budget.'
  );

  expect(blob.arrayBufferMock).not.toHaveBeenCalled();
  expect(browserDownloadsDownloadMock).not.toHaveBeenCalled();
});

it('fails capture jobs when blob downloads do not return a download id', async () => {
  const { executeDownloadBlob } = await import('./execute');
  const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
  browserDownloadsDownloadMock.mockResolvedValue(undefined);

  await expect(
    executeDownloadBlob(new Blob(['data']), 'capture.png', null, 'job-1')
  ).resolves.toBeUndefined();

  expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300000);
  expect(transitionCaptureJobMock).toHaveBeenCalledWith('job-1', 'failed', {
    error: 'Download did not return an id',
  });
});

it('revokes blob URLs immediately when download creation fails', async () => {
  const { executeDownloadBlob } = await import('./execute');
  browserDownloadsDownloadMock.mockRejectedValue(new Error('download failed'));

  await expect(executeDownloadBlob(new Blob(['data']), 'capture.png')).rejects.toThrow(
    'download failed'
  );

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download-url');
});
