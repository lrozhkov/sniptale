import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserStorageSyncGetMock, browserStorageSyncSetMock, loggerDebugMock, loggerWarnMock } =
  vi.hoisted(() => ({
    browserStorageSyncGetMock: vi.fn(),
    browserStorageSyncSetMock: vi.fn(),
    loggerDebugMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal()),
  browserStorage: {
    sync: {
      get: browserStorageSyncGetMock,
      remove: vi.fn(),
      set: browserStorageSyncSetMock,
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  createLogger: vi.fn(() => ({
    debug: loggerDebugMock,
    warn: loggerWarnMock,
  })),
}));

import {
  DEFAULT_SETTINGS,
  createDefaultSettings,
  patchSettings,
  resetSettingsToDefaults,
} from './index';

function createDeferredSet() {
  let resolve: (() => void) | null = null;

  return {
    promise: new Promise<void>((innerResolve) => {
      resolve = innerResolve;
    }),
    resolve: () => resolve?.(),
  };
}

async function flushMicrotasks(turns = 5) {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}

describe('settings patch persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserStorageSyncGetMock.mockResolvedValue({});
    browserStorageSyncSetMock.mockResolvedValue(undefined);
  });

  it('serializes patch writes and returns each committed settings payload', async () => {
    const initialSettings = { ...DEFAULT_SETTINGS, imageFormat: 'jpeg' as const, imageQuality: 70 };
    const firstCommittedSettings = { ...initialSettings, imageFormat: 'webp' as const };
    const secondCommittedSettings = { ...firstCommittedSettings, imageQuality: 92 };
    const deferredSet = createDeferredSet();

    browserStorageSyncGetMock
      .mockResolvedValueOnce({ sniptale_settings: initialSettings })
      .mockResolvedValueOnce({ sniptale_settings: firstCommittedSettings });
    browserStorageSyncSetMock
      .mockImplementationOnce(() => deferredSet.promise)
      .mockResolvedValueOnce(undefined);

    const firstPatch = patchSettings({ imageFormat: 'webp' });
    const secondPatch = patchSettings({ imageQuality: 92 });

    await flushMicrotasks();

    expect(browserStorageSyncGetMock).toHaveBeenCalledTimes(1);

    deferredSet.resolve();

    await expect(firstPatch).resolves.toEqual(firstCommittedSettings);
    await expect(secondPatch).resolves.toEqual(secondCommittedSettings);
    expect(browserStorageSyncSetMock).toHaveBeenNthCalledWith(1, {
      sniptale_settings: firstCommittedSettings,
    });
    expect(browserStorageSyncSetMock).toHaveBeenNthCalledWith(2, {
      sniptale_settings: secondCommittedSettings,
    });
  });
});

describe('web snapshot disclosure settings patch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserStorageSyncGetMock.mockResolvedValue({});
    browserStorageSyncSetMock.mockResolvedValue(undefined);
  });

  it('persists skip preference through the settings patch seam', async () => {
    const committedSettings = { ...DEFAULT_SETTINGS, skipWebSnapshotSaveDisclosure: true };

    browserStorageSyncGetMock.mockResolvedValueOnce({ sniptale_settings: DEFAULT_SETTINGS });

    await expect(patchSettings({ skipWebSnapshotSaveDisclosure: true })).resolves.toEqual(
      committedSettings
    );
    expect(browserStorageSyncSetMock).toHaveBeenCalledWith({
      sniptale_settings: committedSettings,
    });
  });
});

describe('settings reset persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserStorageSyncGetMock.mockResolvedValue({});
    browserStorageSyncSetMock.mockResolvedValue(undefined);
  });

  it('rejects failed patches and can still reset settings back to defaults', async () => {
    browserStorageSyncGetMock.mockResolvedValueOnce({ sniptale_settings: DEFAULT_SETTINGS });
    browserStorageSyncSetMock
      .mockRejectedValueOnce(new Error('persist failed'))
      .mockResolvedValueOnce(undefined);

    await expect(patchSettings({ imageQuality: 55 })).rejects.toThrow('persist failed');
    await expect(resetSettingsToDefaults()).resolves.toEqual(createDefaultSettings());

    expect(browserStorageSyncSetMock).toHaveBeenLastCalledWith({
      sniptale_settings: createDefaultSettings(),
    });
  });
});
