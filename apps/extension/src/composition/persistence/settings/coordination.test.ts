import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    sync: storage,
    subscribeToChanges: storage.subscribe,
  },
}));

function installCrossContextLocks() {
  let settingsQueue: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: <T>(name: string, _options: unknown, operation: () => Promise<T>) => {
        if (name !== 'sniptale:settings') return Promise.resolve().then(operation);
        const next = settingsQueue.then(operation);
        settingsQueue = next.catch(() => undefined);
        return next;
      },
    },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  installCrossContextLocks();
  storage.subscribe.mockReturnValue(() => undefined);
});

afterEach(() => vi.unstubAllGlobals());

it('serializes independent page instances and preserves Crop with disjoint settings patches', async () => {
  let persisted: Record<string, unknown> = { imageFormat: 'png', imageQuality: 100 };
  let releaseFirstWrite: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => {
    releaseFirstWrite = resolve;
  });
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    if (storage.set.mock.calls.length === 1) await firstWrite;
    persisted = items.sniptale_settings;
  });

  const firstPage = await import('./index');
  vi.resetModules();
  const secondPage = await import('./index');

  const imagePatch = firstPage.patchSettings({
    imageFormat: 'webp',
    contentToolbar: { dockEdge: 'right-bottom', cropMode: 'resize' },
  });
  await vi.waitFor(() => expect(storage.set).toHaveBeenCalledTimes(1));
  const qualityPatch = secondPage.patchSettings({
    imageQuality: 85,
    contentToolbar: { compactMenus: true },
  });
  await Promise.resolve();
  expect(storage.get).toHaveBeenCalledTimes(2);
  releaseFirstWrite?.();
  await Promise.all([imagePatch, qualityPatch]);
  expect(persisted).toMatchObject({
    imageFormat: 'webp',
    imageQuality: 85,
    contentToolbar: { dockEdge: 'right-bottom', compactMenus: true, cropMode: 'resize' },
  });
});

it('merges visibility edits from independent pages after an in-flight write', async () => {
  let persisted: Record<string, unknown> = {
    contentToolbar: { compactMenus: true, recordingControls: { camera: false } },
  };
  const entered = controlledGate();
  const releaseWrite = controlledGate();
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    if (storage.set.mock.calls.length === 1) {
      entered.release();
      await releaseWrite.promise;
    }
    persisted = items.sniptale_settings;
  });
  const firstPage = await import('./index');
  vi.resetModules();
  const secondPage = await import('./index');
  const first = firstPage.patchSettings({
    contentToolbar: { recordingControls: { pencil: false }, fadeDuringRecording: false },
  });
  await entered.promise;
  const second = secondPage.patchSettings({
    contentToolbar: { recordingControls: { camera: true } },
  });
  releaseWrite.release();
  await Promise.all([first, second]);
  expect((await secondPage.loadSettings()).contentToolbar).toMatchObject({
    compactMenus: true,
    recordingControls: { camera: true, pencil: false },
    fadeDuringRecording: false,
  });
});

it('merges page controls from independent toolbars without replacing recording preferences', async () => {
  let persisted: Record<string, unknown> = {
    contentToolbar: {
      pageControls: { 'capture-delay': false },
      pageControlOverrides: { drawing: { 'capture-delay': false } },
      recordingControls: { camera: false },
    },
  };
  const entered = controlledGate();
  const releaseWrite = controlledGate();
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    if (storage.set.mock.calls.length === 1) {
      entered.release();
      await releaseWrite.promise;
    }
    persisted = items.sniptale_settings;
  });
  const firstPage = await import('./index');
  vi.resetModules();
  const secondPage = await import('./index');
  const first = firstPage.patchSettings({
    contentToolbar: {
      pageControls: { 'drawing-pencil': false },
      pageControlOverrides: { drawing: { 'capture-full': true } },
    },
  });
  await entered.promise;
  const second = secondPage.patchSettings({
    contentToolbar: {
      pageControls: { 'review-panel': false },
      pageControlOverrides: {
        drawing: { 'capture-visible': false },
        highlighter: { 'capture-full': false },
      },
    },
  });
  releaseWrite.release();
  await Promise.all([first, second]);
  expect((await secondPage.loadSettings()).contentToolbar).toMatchObject({
    pageControls: { 'capture-delay': false, 'drawing-pencil': false, 'review-panel': false },
    pageControlOverrides: {
      drawing: { 'capture-delay': false, 'capture-full': true, 'capture-visible': false },
      highlighter: { 'capture-full': false },
    },
    recordingControls: { camera: false },
  });
});

it('orders page visibility reset and a later choice without resurrecting hidden controls', async () => {
  let persisted: Record<string, unknown> = {};
  const entered = controlledGate();
  const releaseWrite = controlledGate();
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    if (storage.set.mock.calls.length === 1) {
      entered.release();
      await releaseWrite.promise;
    }
    persisted = items.sniptale_settings;
  });
  const page = await import('./index');
  const first = page.patchSettings({
    contentToolbar: {
      pageControls: { 'drawing-pencil': false },
      pageControlOverrides: { drawing: { 'capture-full': true } },
    },
  });
  await entered.promise;
  const reset = page.resetSettingsToDefaults();
  const next = page.patchSettings({
    contentToolbar: {
      pageControls: { 'capture-size': false },
      pageControlOverrides: { highlighter: { 'capture-full': true } },
    },
  });
  releaseWrite.release();
  await Promise.all([first, reset, next]);
  expect((await page.loadSettings()).contentToolbar?.pageControls).toEqual({
    'capture-size': false,
  });
  expect((await page.loadSettings()).contentToolbar?.pageControlOverrides).toEqual({
    highlighter: { 'capture-full': true },
  });
});

it('orders visibility write, reset, and a new choice without restoring a stale map', async () => {
  let persisted: Record<string, unknown> = {};
  const entered = controlledGate();
  const releaseWrite = controlledGate();
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    if (storage.set.mock.calls.length === 1) {
      entered.release();
      await releaseWrite.promise;
    }
    persisted = items.sniptale_settings;
  });
  const page = await import('./index');
  const first = page.patchSettings({ contentToolbar: { recordingControls: { pencil: false } } });
  await entered.promise;
  const reset = page.resetSettingsToDefaults();
  const next = page.patchSettings({ contentToolbar: { recordingControls: { camera: false } } });
  releaseWrite.release();
  await Promise.all([first, reset, next]);
  expect((await page.loadSettings()).contentToolbar?.recordingControls).toEqual({ camera: false });
});

it('rejects an obsolete policy edit after a conflicting page commit', async () => {
  let persisted: Record<string, unknown> = {};
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    persisted = items.sniptale_settings;
  });
  const firstPage = await import('./index');
  vi.resetModules();
  const secondPage = await import('./index');
  const original = (await firstPage.loadSettings()).localStoragePolicy;
  await firstPage.patchLocalStoragePolicy({ trashCleanupEnabled: true }, original);
  await expect(
    secondPage.patchLocalStoragePolicy({ trashRetentionDays: 7 }, original)
  ).rejects.toBeInstanceOf(secondPage.StaleLocalStoragePolicyError);
  expect((await secondPage.loadSettings()).localStoragePolicy).toMatchObject({
    trashCleanupEnabled: true,
    trashRetentionDays: 30,
  });
});

it('observes only the settings sync key and normalizes removal', async () => {
  vi.stubGlobal('chrome', {});
  const observer: {
    notify?: (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      area: string
    ) => void;
  } = {};
  storage.subscribe.mockImplementation((listener) => {
    observer.notify = listener;
    return () => {
      delete observer.notify;
    };
  });
  const { subscribeToSettingsChanges } = await import('./index');
  const listener = vi.fn();
  const unsubscribe = subscribeToSettingsChanges(listener);
  observer.notify?.(
    {
      sniptale_settings: {
        newValue: { localStoragePolicy: { trashCleanupEnabled: true, trashRetentionDays: 7 } },
      },
    },
    'local'
  );
  observer.notify?.({ unrelated: { newValue: true } }, 'sync');
  expect(listener).not.toHaveBeenCalled();
  observer.notify?.(
    {
      sniptale_settings: {
        newValue: { localStoragePolicy: { trashCleanupEnabled: true, trashRetentionDays: 7 } },
      },
    },
    'sync'
  );
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({
      localStoragePolicy: expect.objectContaining({
        trashCleanupEnabled: true,
        trashRetentionDays: 7,
      }),
    })
  );
  observer.notify?.(
    {
      sniptale_settings: {
        oldValue: { localStoragePolicy: { trashCleanupEnabled: true, trashRetentionDays: 7 } },
      },
    },
    'sync'
  );
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({
      localStoragePolicy: expect.objectContaining({
        trashCleanupEnabled: false,
        trashRetentionDays: 30,
      }),
    })
  );
  unsubscribe();
  expect(observer.notify).toBeUndefined();
});

function controlledGate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

it('completes an in-flight Crop and corner write before a queued reset', async () => {
  let persisted: Record<string, unknown> = {};
  const entered = controlledGate();
  const releaseWrite = controlledGate();
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    if (storage.set.mock.calls.length === 1) {
      entered.release();
      await releaseWrite.promise;
    }
    persisted = items.sniptale_settings;
  });
  const page = await import('./index');
  const write = page.patchSettings({
    contentToolbar: { dockEdge: 'top-right', cropMode: 'resize', fadeDuringRecording: false },
  });
  await entered.promise;
  const reset = page.resetSettingsToDefaults();
  releaseWrite.release();
  await Promise.all([write, reset]);
  expect((await page.loadSettings()).contentToolbar).toEqual(
    page.createDefaultSettings().contentToolbar
  );
});

it('recreates the settings key only with a new accepted Crop and dock choice after deletion', async () => {
  let persisted: Record<string, unknown> = {
    contentToolbar: {
      dockEdge: 'right-bottom',
      compactMenus: true,
      cropMode: 'resize',
      fadeDuringRecording: false,
    },
  };
  const entered = controlledGate();
  const releaseDelete = controlledGate();
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.remove.mockImplementation(async () => {
    entered.release();
    await releaseDelete.promise;
    persisted = {};
  });
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    persisted = items.sniptale_settings;
  });
  const page = await import('./index');
  const deletion = page.clearSettings();
  await entered.promise;
  const recreation = page.patchSettings({
    contentToolbar: { dockEdge: 'left-top', cropMode: 'drawing', fadeDuringRecording: true },
  });
  releaseDelete.release();
  await Promise.all([deletion, recreation]);
  expect((await page.loadSettings()).contentToolbar).toMatchObject({
    dockEdge: 'left-top',
    compactMenus: false,
    cropMode: 'drawing',
    fadeDuringRecording: true,
  });
});

it('retains accepted Crop and dock preferences after failure and permits retry', async () => {
  let persisted: Record<string, unknown> = {
    contentToolbar: { dockEdge: 'left-top', cropMode: 'resize', fadeDuringRecording: true },
  };
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set
    .mockRejectedValueOnce(new Error('write refused'))
    .mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
      persisted = items.sniptale_settings;
    });
  const page = await import('./index');
  await expect(
    page.patchSettings({
      contentToolbar: { dockEdge: 'right-bottom', cropMode: 'drawing', fadeDuringRecording: false },
    })
  ).rejects.toThrow('write refused');
  expect((await page.loadSettings()).contentToolbar?.dockEdge).toBe('left-top');
  expect((await page.loadSettings()).contentToolbar?.cropMode).toBe('resize');
  expect((await page.loadSettings()).contentToolbar?.fadeDuringRecording).toBe(true);
  await page.patchSettings({
    contentToolbar: { dockEdge: 'right-bottom', cropMode: 'drawing', fadeDuringRecording: false },
  });
  expect((await page.loadSettings()).contentToolbar?.dockEdge).toBe('right-bottom');
  expect((await page.loadSettings()).contentToolbar?.cropMode).toBe('drawing');
  expect((await page.loadSettings()).contentToolbar?.fadeDuringRecording).toBe(false);
});

it('completes an in-flight Crop choice before a settings replacement', async () => {
  let persisted: Record<string, unknown> = {};
  const entered = controlledGate();
  const releaseWrite = controlledGate();
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    if (storage.set.mock.calls.length === 1) {
      entered.release();
      await releaseWrite.promise;
    }
    persisted = items.sniptale_settings;
  });
  const page = await import('./index');
  const write = page.patchSettings({
    contentToolbar: { cropMode: 'resize', fadeDuringRecording: false },
  });
  await entered.promise;
  const defaults = page.createDefaultSettings();
  const replacement = page.saveSettings({
    ...defaults,
    contentToolbar: { ...defaults.contentToolbar!, cropMode: 'drawing', fadeDuringRecording: true },
  });
  releaseWrite.release();
  await Promise.all([write, replacement]);
  expect((await page.loadSettings()).contentToolbar?.cropMode).toBe('drawing');
  expect((await page.loadSettings()).contentToolbar?.fadeDuringRecording).toBe(true);
});

it('retains the last rapid Crop choice through the existing settings queue', async () => {
  let persisted: Record<string, unknown> = { contentToolbar: { dockEdge: 'bottom-left' } };
  const entered = controlledGate();
  const releaseWrite = controlledGate();
  storage.get.mockImplementation(async () => ({ sniptale_settings: persisted }));
  storage.set.mockImplementation(async (items: { sniptale_settings: Record<string, unknown> }) => {
    if (storage.set.mock.calls.length === 1) {
      entered.release();
      await releaseWrite.promise;
    }
    persisted = items.sniptale_settings;
  });
  const page = await import('./index');
  const first = page.patchSettings({ contentToolbar: { cropMode: 'resize' } });
  await entered.promise;
  const second = page.patchSettings({ contentToolbar: { cropMode: 'drawing' } });
  const third = page.patchSettings({ contentToolbar: { cropMode: 'resize' } });
  releaseWrite.release();
  await Promise.all([first, second, third]);
  expect((await page.loadSettings()).contentToolbar).toMatchObject({
    cropMode: 'resize',
    dockEdge: 'bottom-left',
  });
});

it('observes voice-only changes and settings removal through canonical preferences', async () => {
  vi.stubGlobal('chrome', {});
  const settings = await import('./index');
  const listener = vi.fn();
  const unsubscribe = vi.fn();
  storage.subscribe.mockReturnValueOnce(unsubscribe);
  const stop = settings.subscribeToVoiceInputPreferencesChanges(listener);
  const notify = storage.subscribe.mock.calls[0]?.[0];
  const voice = {
    language: 'en-US',
    mode: 'browser-managed',
    microphoneDeviceId: null,
    enabled: false,
  };
  notify({ sniptale_settings: { oldValue: {}, newValue: { voiceInput: voice } } }, 'sync');
  expect(listener).toHaveBeenLastCalledWith(voice);
  notify({ sniptale_settings: { oldValue: { voiceInput: voice }, newValue: undefined } }, 'sync');
  expect(listener).toHaveBeenLastCalledWith({
    language: 'ru-RU',
    mode: 'local-first',
    microphoneDeviceId: null,
  });
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(storage.set).not.toHaveBeenCalled();
});

it('does not notify voice consumers for unrelated settings or storage areas', async () => {
  vi.stubGlobal('chrome', {});
  const settings = await import('./index');
  const listener = vi.fn();
  settings.subscribeToVoiceInputPreferencesChanges(listener);
  const notify = storage.subscribe.mock.calls[0]?.[0];
  notify({ sniptale_settings: { oldValue: {}, newValue: { imageQuality: 80 } } }, 'sync');
  notify({ another_key: { oldValue: {}, newValue: {} } }, 'sync');
  notify(
    {
      sniptale_settings: {
        oldValue: {},
        newValue: { voiceInput: { language: 'en-US', mode: 'browser-managed', enabled: false } },
      },
    },
    'local'
  );
  expect(listener).not.toHaveBeenCalled();
});
