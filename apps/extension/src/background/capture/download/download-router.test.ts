import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  downloadMock,
  searchMock,
  subscribeToChangedMock,
  loadSettingsMock,
  getLastSaveAsDirectoryMock,
  setLastSaveAsDirectoryMock,
  getRegisteredListener,
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
    getRegisteredListener: () => listeners.at(-1),
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

function resetDownloadRouterMocks() {
  vi.clearAllMocks();
  resetRegisteredListeners();
  vi.resetModules();
}

async function verifiesPresetPathHelpers() {
  loadSettingsMock.mockResolvedValue({
    presets: [
      { id: 'preset-1', path: 'images/screenshots///' },
      { id: 'preset-2', path: '' },
      { id: 'preset-3', path: '../../tmp\\screens' },
    ],
  });

  const { buildDownloadFilename, resolvePresetPath } = await importDownloadRouter();

  await expect(resolvePresetPath(undefined)).resolves.toBeNull();
  await expect(resolvePresetPath('preset-1')).resolves.toBe('images/screenshots');
  await expect(resolvePresetPath('preset-2')).resolves.toBeNull();
  await expect(resolvePresetPath('preset-3')).resolves.toBe('tmp/screens');
  await expect(resolvePresetPath('preset-missing')).resolves.toBeNull();

  expect(buildDownloadFilename(null, 'capture.png')).toBe('capture.png');
  expect(buildDownloadFilename('', 'capture.png')).toBe('capture.png');
  expect(buildDownloadFilename('images/screenshots///', 'capture.png')).toBe(
    'images/screenshots/capture.png'
  );
  expect(buildDownloadFilename('../../tmp\\screens', '../evil.webm')).toBe('tmp/screens/evil.webm');
  expect(buildDownloadFilename('/absolute/path', 'a\\b:capture?.png')).toBe(
    'absolute/path/bcapture.png'
  );
}

async function verifiesImportDoesNotCreateTheDownloadRouterService() {
  await importDownloadRouter();

  expect(subscribeToChangedMock).not.toHaveBeenCalled();
}

async function verifiesIgnoredCaptureActions() {
  const { executeDownload } = await importDownloadRouter();

  await expect(
    executeDownload('data:image/png;base64,1', 'capture.png', 'copy')
  ).resolves.toBeUndefined();
  await expect(
    executeDownload('data:image/png;base64,1', 'capture.png', 'edit')
  ).resolves.toBeUndefined();

  expect(downloadMock).not.toHaveBeenCalled();
}

async function verifiesAskSystemDownloadAndRelativeDirectoryPersistence() {
  getLastSaveAsDirectoryMock.mockResolvedValue('chosen/folder');
  downloadMock.mockResolvedValue(77);
  searchMock.mockResolvedValue([{ filename: 'nested/output/capture.png' }]);

  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { executeDownload } = await importDownloadRouter();

  await executeDownload('data:image/png;base64,1', 'capture.png', 'ask_system');

  expect(subscribeToChangedMock).toHaveBeenCalledTimes(1);
  expect(downloadMock).toHaveBeenCalledWith({
    url: 'data:image/png;base64,1',
    filename: 'chosen/folder/capture.png',
    saveAs: true,
  });
  expect(logSpy).toHaveBeenCalledWith(
    '[BackgroundDownloadRouter]',
    'Saved via system dialog',
    'chosen/folder/capture.png'
  );

  getRegisteredListener()?.({
    id: 77,
    state: { current: 'complete' },
  });
  await flushPromises();

  expect(searchMock).toHaveBeenCalledWith({ id: 77 });
  expect(setLastSaveAsDirectoryMock).toHaveBeenCalledWith('nested/output');
}

async function verifiesAbsoluteSaveAsPathsAreIgnored() {
  getLastSaveAsDirectoryMock.mockResolvedValue('');
  downloadMock.mockResolvedValue(31);
  searchMock.mockResolvedValue([{ filename: 'C:/Downloads/capture.png' }]);

  const { executeDownload } = await importDownloadRouter();
  await executeDownload('data:image/png;base64,2', 'capture.png', 'ask_system');

  getRegisteredListener()?.({
    id: 31,
    state: { current: 'complete' },
  });
  await flushPromises();

  expect(setLastSaveAsDirectoryMock).not.toHaveBeenCalled();
}

async function verifiesPresetDownloadsAndBlobCleanup() {
  loadSettingsMock.mockResolvedValue({
    presets: [{ id: 'preset-1', path: 'gallery/snaps' }],
  });
  downloadMock.mockResolvedValue(44);

  const createObjectUrlSpy = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:download-router');
  const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { executeDownload, executeDownloadBlob } = await importDownloadRouter();

  await executeDownload('data:image/png;base64,3', 'capture.png', 'download_default', 'preset-1');
  await executeDownloadBlob(new Blob(['zip-data']), 'archive.zip', 'preset-1');

  expect(downloadMock).toHaveBeenNthCalledWith(1, {
    url: 'data:image/png;base64,3',
    filename: 'gallery/snaps/capture.png',
    saveAs: false,
  });
  expect(downloadMock).toHaveBeenNthCalledWith(2, {
    url: 'blob:download-router',
    filename: 'gallery/snaps/archive.zip',
    saveAs: false,
  });
  expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
  expect(revokeObjectUrlSpy).not.toHaveBeenCalled();
  getRegisteredListener()?.({
    id: 44,
    state: { current: 'complete' },
  });
  expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:download-router');
  expect(logSpy).toHaveBeenCalledWith(
    '[BackgroundDownloadRouter]',
    'Saved to preset path',
    'gallery/snaps/capture.png'
  );
  expect(logSpy).toHaveBeenCalledWith(
    '[BackgroundDownloadRouter]',
    'Blob saved',
    'gallery/snaps/archive.zip'
  );
}

async function verifiesBlobDownloadFallsBackWithoutObjectUrlSupport() {
  loadSettingsMock.mockResolvedValue({
    presets: [{ id: 'preset-1', path: 'gallery/snaps' }],
  });
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });

  const { executeDownloadBlob } = await importDownloadRouter();
  downloadMock.mockResolvedValue(44);

  await expect(
    executeDownloadBlob(new Blob(['zip-data']), 'archive.zip', 'preset-1')
  ).resolves.toBe(44);
  expect(downloadMock).toHaveBeenCalledWith({
    filename: 'gallery/snaps/archive.zip',
    saveAs: false,
    url: 'data:application/octet-stream;base64,emlwLWRhdGE=',
  });
  expect(subscribeToChangedMock).not.toHaveBeenCalled();

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevokeObjectURL,
  });
}

describe('download-router', () => {
  beforeEach(resetDownloadRouterMocks);

  it(
    'keeps the download router service lazy until save-as flow uses it',
    verifiesImportDoesNotCreateTheDownloadRouterService
  );
  it('resolves preset paths and builds normalized filenames', verifiesPresetPathHelpers);
  it('skips browser downloads for copy/edit actions', verifiesIgnoredCaptureActions);
  it(
    'uses the system save dialog and persists a relative directory after completion',
    verifiesAskSystemDownloadAndRelativeDirectoryPersistence
  );
  it(
    'ignores absolute completed paths from the system save dialog listener',
    verifiesAbsoluteSaveAsPathsAreIgnored
  );
  it('downloads preset files and always revokes blob urls', verifiesPresetDownloadsAndBlobCleanup);
  it(
    'falls back when blob object urls are unavailable',
    verifiesBlobDownloadFallsBackWithoutObjectUrlSupport
  );
});
