import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  downloadMock,
  searchMock,
  subscribeToChangedMock,
  loadSettingsMock,
  getLastSaveAsDirectoryMock,
  setLastSaveAsDirectoryMock,
  getRegisteredListeners,
  resetRegisteredListeners,
} = vi.hoisted(() => {
  type DownloadChangedListener = (delta: {
    id?: number | null;
    state?: { current?: string };
  }) => void;
  let listeners: DownloadChangedListener[] = [];

  return {
    downloadMock: vi.fn(),
    searchMock: vi.fn(),
    subscribeToChangedMock: vi.fn((callback) => {
      const listener = callback as DownloadChangedListener;
      listeners.push(listener);
      return vi.fn(() => {
        listeners = listeners.filter((candidate) => candidate !== listener);
      });
    }),
    loadSettingsMock: vi.fn(),
    getLastSaveAsDirectoryMock: vi.fn(),
    setLastSaveAsDirectoryMock: vi.fn(),
    getRegisteredListeners: () => [...listeners],
    resetRegisteredListeners: () => {
      listeners = [];
    },
  };
});

vi.mock('@sniptale/platform/browser/downloads', () => ({
  BrowserDownloadsAdapter: undefined,
  browserDownloads: {
    download: downloadMock,
    search: searchMock,
    subscribeToChanged: subscribeToChangedMock,
  },
}));

vi.mock('./save-directory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./save-directory')>()),
  getLastSaveAsDirectory: getLastSaveAsDirectoryMock,
  setLastSaveAsDirectory: setLastSaveAsDirectoryMock,
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

async function importDownloadRouter() {
  return import('./download-router/index');
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function emitDownloadChange(delta: { id?: number | null; state?: { current?: string } }) {
  getRegisteredListeners().forEach((listener) => listener(delta));
}

function resetDownloadRouterMocks() {
  vi.clearAllMocks();
  resetRegisteredListeners();
  vi.resetModules();
}

async function verifiesRepeatedSaveAsIgnoresStaleCompletion() {
  getLastSaveAsDirectoryMock.mockResolvedValue('');
  downloadMock.mockResolvedValueOnce(51).mockResolvedValueOnce(52);
  searchMock.mockImplementation(async (query: { id?: number }) =>
    query.id === 52
      ? [{ filename: 'new/output/second.png' }]
      : [{ filename: 'old/output/first.png' }]
  );

  const { executeDownload } = await importDownloadRouter();
  await executeDownload('data:image/png;base64,1', 'first.png', 'ask_system');
  await executeDownload('data:image/png;base64,2', 'second.png', 'ask_system');

  emitDownloadChange({ id: 51, state: { current: 'complete' } });
  await flushPromises();
  emitDownloadChange({ id: 52, state: { current: 'complete' } });
  await flushPromises();

  expect(searchMock).toHaveBeenCalledTimes(1);
  expect(searchMock).toHaveBeenCalledWith({ id: 52 });
  expect(setLastSaveAsDirectoryMock).toHaveBeenCalledTimes(1);
  expect(setLastSaveAsDirectoryMock).toHaveBeenCalledWith('new/output');
}

async function verifiesPendingSaveAsInvalidatesPreviousDownload() {
  getLastSaveAsDirectoryMock.mockResolvedValue('');
  const pendingSecondDownload = createDeferred<number | undefined>();
  downloadMock.mockResolvedValueOnce(61).mockReturnValueOnce(pendingSecondDownload.promise);
  searchMock.mockImplementation(async (query: { id?: number }) =>
    query.id === 62
      ? [{ filename: 'new/output/second.png' }]
      : [{ filename: 'old/output/first.png' }]
  );

  const { executeDownload } = await importDownloadRouter();
  await executeDownload('data:image/png;base64,1', 'first.png', 'ask_system');
  const secondDownloadPromise = executeDownload(
    'data:image/png;base64,2',
    'second.png',
    'ask_system'
  );
  await flushPromises();
  emitDownloadChange({ id: 61, state: { current: 'complete' } });
  await flushPromises();

  expect(searchMock).not.toHaveBeenCalled();
  expect(setLastSaveAsDirectoryMock).not.toHaveBeenCalled();

  pendingSecondDownload.resolve(62);
  await secondDownloadPromise;
  emitDownloadChange({ id: 62, state: { current: 'complete' } });
  await flushPromises();

  expect(searchMock).toHaveBeenCalledTimes(1);
  expect(searchMock).toHaveBeenCalledWith({ id: 62 });
  expect(setLastSaveAsDirectoryMock).toHaveBeenCalledWith('new/output');
}

async function verifiesUndefinedSaveAsInvalidatesPreviousDownload() {
  getLastSaveAsDirectoryMock.mockResolvedValue('');
  const pendingSecondDownload = createDeferred<number | undefined>();
  downloadMock.mockResolvedValueOnce(63).mockReturnValueOnce(pendingSecondDownload.promise);
  searchMock.mockResolvedValue([{ filename: 'old/output/first.png' }]);

  const { executeDownload } = await importDownloadRouter();
  await executeDownload('data:image/png;base64,1', 'first.png', 'ask_system');
  const secondDownloadPromise = executeDownload(
    'data:image/png;base64,2',
    'second.png',
    'ask_system'
  );
  await flushPromises();
  emitDownloadChange({ id: 63, state: { current: 'complete' } });
  await flushPromises();
  pendingSecondDownload.resolve(undefined);
  await secondDownloadPromise;

  expect(searchMock).not.toHaveBeenCalled();
  expect(setLastSaveAsDirectoryMock).not.toHaveBeenCalled();
}

async function verifiesPendingSaveAsDirectoryReadInvalidatesPreviousDownload() {
  const pendingLastDir = createDeferred<string>();
  getLastSaveAsDirectoryMock.mockResolvedValueOnce('');
  getLastSaveAsDirectoryMock.mockReturnValueOnce(pendingLastDir.promise);
  downloadMock.mockResolvedValueOnce(64).mockResolvedValueOnce(undefined);
  searchMock.mockResolvedValue([{ filename: 'old/output/first.png' }]);

  const { executeDownload } = await importDownloadRouter();
  await executeDownload('data:image/png;base64,1', 'first.png', 'ask_system');
  const secondDownloadPromise = executeDownload(
    'data:image/png;base64,2',
    'second.png',
    'ask_system'
  );
  await flushPromises();
  emitDownloadChange({ id: 64, state: { current: 'complete' } });
  await flushPromises();
  pendingLastDir.resolve('');
  await secondDownloadPromise;

  expect(searchMock).not.toHaveBeenCalled();
  expect(setLastSaveAsDirectoryMock).not.toHaveBeenCalled();
}

async function verifiesBlobDownloadUsesFallbackCleanupWithoutDownloadId() {
  vi.useFakeTimers();
  loadSettingsMock.mockResolvedValue({ presets: [] });
  downloadMock.mockResolvedValue(undefined);
  const createObjectUrlSpy = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:download-router-no-id');
  const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const { executeDownloadBlob } = await importDownloadRouter();

  await executeDownloadBlob(new Blob(['zip-data']), 'archive.zip');

  expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
  expect(revokeObjectUrlSpy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
  expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:download-router-no-id');
  vi.useRealTimers();
}

describe('download-router lifecycle', () => {
  beforeEach(resetDownloadRouterMocks);

  it(
    'ignores stale save-as completions after repeated operations',
    verifiesRepeatedSaveAsIgnoresStaleCompletion
  );
  it(
    'invalidates previous save-as while a new system dialog is pending',
    verifiesPendingSaveAsInvalidatesPreviousDownload
  );
  it(
    'keeps previous save-as invalidated when a newer system dialog returns no id',
    verifiesUndefinedSaveAsInvalidatesPreviousDownload
  );
  it(
    'invalidates previous save-as while a newer directory read is pending',
    verifiesPendingSaveAsDirectoryReadInvalidatesPreviousDownload
  );
  it(
    'falls back to timed blob url cleanup when downloads returns no id',
    verifiesBlobDownloadUsesFallbackCleanupWithoutDownloadId
  );
});
