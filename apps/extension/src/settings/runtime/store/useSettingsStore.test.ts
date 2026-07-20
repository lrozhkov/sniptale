import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsFixture = {
  captureAction: 'download_default' as const,
  contextMenu: {
    enabled: true,
    showScreenshots: true,
    showVideo: true,
    showExport: true,
    showImageEditor: true,
    showVideoEditor: true,
    showGallery: true,
    showPageLinkCopy: true,
    showSettings: true,
  },
  saveCapturesToGallery: false,
  viewportPresets: [],
  presets: [],
  defaultImagePresetId: null,
  defaultVideoPresetId: null,
  defaultExportPresetId: null,
  imageFormat: 'png' as const,
  imageQuality: 100,
  authenticatedSnapshotAssetsEnabled: true,
  anonymousCrossOriginSnapshotAssetsEnabled: false,
  skipWebSnapshotSaveDisclosure: false,
  rawDiagnosticsEnabled: false,
};

const {
  loadSettingsRuntimeStateMock,
  resetSettingsRuntimeStateMock,
  updateSettingsRuntimeStateMock,
} = vi.hoisted(() => ({
  loadSettingsRuntimeStateMock: vi.fn(),
  resetSettingsRuntimeStateMock: vi.fn(),
  updateSettingsRuntimeStateMock: vi.fn(),
}));

vi.mock('./settings-runtime-service', () => ({
  DEFAULT_SETTINGS: settingsFixture,
  loadSettingsRuntimeState: loadSettingsRuntimeStateMock,
  resetSettingsRuntimeState: resetSettingsRuntimeStateMock,
  updateSettingsRuntimeState: updateSettingsRuntimeStateMock,
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

async function loadStore() {
  vi.resetModules();
  const module = await import('./useSettingsStore');
  module.useSettingsStore.setState({
    settings: settingsFixture,
    isLoading: false,
    error: null,
  });
  return module.useSettingsStore;
}

async function createIsolatedSettingsStore() {
  vi.resetModules();
  const module = await import('./useSettingsStore');
  return module.createSettingsStore();
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSettingsRuntimeStateMock.mockResolvedValue(settingsFixture);
  resetSettingsRuntimeStateMock.mockResolvedValue(settingsFixture);
});

function runUseSettingsStoreLoadSuite() {
  it('loads settings into the store and clears the loading flag', async () => {
    const store = await loadStore();

    await store.getState().loadSettings();

    expect(loadSettingsRuntimeStateMock).toHaveBeenCalledTimes(1);
    expect(store.getState().settings).toMatchObject(settingsFixture);
    expect(store.getState().isLoading).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it('surfaces load failures through the store error state', async () => {
    const store = await loadStore();
    loadSettingsRuntimeStateMock.mockRejectedValueOnce(new Error('load failed'));

    await store.getState().loadSettings();

    expect(store.getState().error).toBe('load failed');
    expect(store.getState().isLoading).toBe(false);
  });
}

async function verifiesQueuedSettingsUpdatesUseTheLatestSavedState() {
  const store = await loadStore();
  const firstWrite = createDeferred<typeof settingsFixture>();

  updateSettingsRuntimeStateMock
    .mockImplementationOnce(async (patch) => {
      expect(patch).toEqual({ imageQuality: 80 });
      return firstWrite.promise;
    })
    .mockImplementationOnce(async (patch) => {
      expect(patch).toEqual({ imageFormat: 'jpeg' });
      return {
        ...settingsFixture,
        imageFormat: 'jpeg',
        imageQuality: 80,
      };
    });

  const firstUpdate = store.getState().updateSettings({ imageQuality: 80 });
  const secondUpdate = store.getState().updateSettings({ imageFormat: 'jpeg' });

  firstWrite.resolve({
    ...settingsFixture,
    imageQuality: 80,
  });

  await Promise.all([firstUpdate, secondUpdate]);

  expect(updateSettingsRuntimeStateMock).toHaveBeenCalledTimes(2);
  expect(store.getState().settings).toMatchObject({
    imageFormat: 'jpeg',
    imageQuality: 80,
  });
  expect(store.getState().isLoading).toBe(false);
  expect(store.getState().error).toBeNull();
}

async function verifiesStaleLoadsDoNotResetQueuedWrites() {
  const store = await loadStore();
  const loadRequest = createDeferred<typeof settingsFixture>();
  const firstWrite = createDeferred<typeof settingsFixture>();

  loadSettingsRuntimeStateMock.mockReturnValueOnce(loadRequest.promise);
  updateSettingsRuntimeStateMock
    .mockImplementationOnce(async (patch) => {
      expect(patch).toEqual({ imageQuality: 80 });
      return firstWrite.promise;
    })
    .mockImplementationOnce(async (patch) => {
      expect(patch).toEqual({ imageFormat: 'jpeg' });
      return {
        ...settingsFixture,
        imageFormat: 'jpeg',
        imageQuality: 80,
      };
    });

  const loadPromise = store.getState().loadSettings();
  const firstUpdate = store.getState().updateSettings({ imageQuality: 80 });

  loadRequest.resolve({
    ...settingsFixture,
    imageQuality: 65,
  });
  await loadPromise;

  const secondUpdate = store.getState().updateSettings({ imageFormat: 'jpeg' });

  firstWrite.resolve({
    ...settingsFixture,
    imageQuality: 80,
  });

  await Promise.all([firstUpdate, secondUpdate]);

  expect(updateSettingsRuntimeStateMock).toHaveBeenCalledTimes(2);
  expect(store.getState().settings).toMatchObject({
    imageFormat: 'jpeg',
    imageQuality: 80,
  });
  expect(store.getState().error).toBeNull();
}

async function verifiesStoreInstancesDoNotShareWriteQueueState() {
  const firstStore = await createIsolatedSettingsStore();
  const secondStore = await createIsolatedSettingsStore();
  const firstWrite = createDeferred<typeof settingsFixture>();

  updateSettingsRuntimeStateMock
    .mockImplementationOnce(async (patch) => {
      expect(patch).toEqual({ imageQuality: 80 });
      return firstWrite.promise;
    })
    .mockImplementationOnce(async (patch) => {
      expect(patch).toEqual({ imageFormat: 'jpeg' });
      return {
        ...settingsFixture,
        imageFormat: 'jpeg',
      };
    });

  const firstUpdate = firstStore.getState().updateSettings({ imageQuality: 80 });
  const secondUpdate = secondStore.getState().updateSettings({ imageFormat: 'jpeg' });

  await secondUpdate;

  expect(updateSettingsRuntimeStateMock).toHaveBeenCalledTimes(2);
  expect(secondStore.getState().settings).toMatchObject({ imageFormat: 'jpeg' });
  expect(secondStore.getState().isLoading).toBe(false);
  expect(firstStore.getState().isLoading).toBe(true);

  firstWrite.resolve({
    ...settingsFixture,
    imageQuality: 80,
  });

  await firstUpdate;
  expect(firstStore.getState().settings).toMatchObject({ imageQuality: 80 });
}

function runUseSettingsStoreUpdateSuite() {
  it(
    'serializes concurrent settings updates against the latest saved state',
    verifiesQueuedSettingsUpdatesUseTheLatestSavedState
  );

  it(
    'ignores stale load results while queued writes are still in flight',
    verifiesStaleLoadsDoNotResetQueuedWrites
  );

  it(
    'keeps write coordination local to each store instance',
    verifiesStoreInstancesDoNotShareWriteQueueState
  );

  it('surfaces update failures and clears the loading flag', async () => {
    const store = await loadStore();
    updateSettingsRuntimeStateMock.mockRejectedValueOnce(new Error('save failed'));

    await expect(store.getState().updateSettings({ imageQuality: 80 })).rejects.toThrow(
      'save failed'
    );

    expect(store.getState().error).toBe('save failed');
    expect(store.getState().isLoading).toBe(false);
  });

  it('uses the fallback update error message for non-Error failures', async () => {
    const store = await loadStore();
    updateSettingsRuntimeStateMock.mockRejectedValueOnce('save failed');

    await expect(store.getState().updateSettings({ imageQuality: 80 })).rejects.toThrow(
      'Failed to save settings'
    );

    expect(store.getState().error).toBe('Failed to save settings');
    expect(store.getState().isLoading).toBe(false);
  });
}

function runUseSettingsStoreClearSuite() {
  it('resets settings through the runtime reset seam', async () => {
    const store = await loadStore();
    resetSettingsRuntimeStateMock.mockResolvedValueOnce({
      ...settingsFixture,
      imageFormat: 'jpeg',
    });

    await store.getState().clearSettings();

    expect(resetSettingsRuntimeStateMock).toHaveBeenCalledTimes(1);
    expect(store.getState().settings).toMatchObject({ imageFormat: 'jpeg' });
    expect(store.getState().isLoading).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it('surfaces reset failures through the store error state', async () => {
    const store = await loadStore();
    resetSettingsRuntimeStateMock.mockRejectedValueOnce(new Error('reset failed'));

    await expect(store.getState().clearSettings()).rejects.toThrow('reset failed');

    expect(store.getState().error).toBe('reset failed');
    expect(store.getState().isLoading).toBe(false);
  });
}

describe('useSettingsStore load paths', runUseSettingsStoreLoadSuite);
describe('useSettingsStore update paths', runUseSettingsStoreUpdateSuite);
describe('useSettingsStore clear paths', runUseSettingsStoreClearSuite);
