import { createContextMenuLayout } from '../../../contracts/settings/context-menu-layout';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserStorageLocalGetMock,
  browserStorageLocalRemoveMock,
  browserStorageLocalSetMock,
  browserStorageSyncGetMock,
  browserStorageSyncRemoveMock,
  browserStorageSyncSetMock,
  loggerDebugMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalRemoveMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
  browserStorageSyncGetMock: vi.fn(),
  browserStorageSyncRemoveMock: vi.fn(),
  browserStorageSyncSetMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: browserStorageLocalGetMock,
      remove: browserStorageLocalRemoveMock,
      set: browserStorageLocalSetMock,
    },
    sync: {
      get: browserStorageSyncGetMock,
      remove: browserStorageSyncRemoveMock,
      set: browserStorageSyncSetMock,
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({
    debug: loggerDebugMock,
    warn: loggerWarnMock,
  })),
}));

import {
  clearSettings,
  createDefaultSettings,
  loadSettings,
  patchSettings,
  removeRetiredSynchronizedSettings,
  saveSettings,
} from './index';
import { createSystemViewportPresetCatalog } from '../../../features/viewport-presets/catalog';
import { normalizeViewportPresetOrder } from '../../../features/viewport-presets/operations';

const DEFAULT_CONTENT_TOOLBAR = {
  displayMode: 'horizontal' as const,
  compactMenus: false,
  position: null,
};
const DEFAULT_CONTEXT_MENU = {
  enabled: true,
  showScreenshots: true,
  showVideo: true,
  showExport: true,
  showImageEditor: false,
  showVideoEditor: false,
  showGallery: true,
  showPageLinkCopy: true,
  showWindowResize: false,
  showSettings: true,
};
const DEFAULT_VIEWPORT_PRESETS = createSystemViewportPresetCatalog();
const PRIVACY_DEFAULTS = {
  anonymousCrossOriginSnapshotAssetsEnabled: true,
  authenticatedSnapshotAssetsEnabled: true,
  externalSnapshotAssetRedirectsEnabled: true,
  externalSnapshotLinksEnabled: false,
};
const DEFAULT_FULL_PAGE_CAPTURE = {
  floatingElements: 'once' as const,
  freezeMotion: true,
  preloadLazyContent: true,
};
const DEFAULT_FULL_PAGE_QUALITY = {
  maxFileSizeMiB: 128,
  maxMegapixels: 80,
  minScalePercent: 100,
  profile: 'maximum' as const,
};
const DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING = {
  loadTimeoutMs: 30_000,
  settleDelayMs: 2_000,
};
const DEFAULT_EXPORT_RESOURCE_LIMITS = {
  maxFileCount: 30,
  maxFileSizeMiB: 30,
  maxTotalSizeMiB: 150,
};
const DEFAULT_VOICE_INPUT = {
  language: 'ru-RU' as const,
  microphoneDeviceId: null,
  mode: 'local-first' as const,
};
const TEMPORARY_STORAGE_POLICY = {
  cleanupEnabled: true,
  defaultDestination: 'temporary' as const,
  recordingDestination: 'temporary' as const,
  webSnapshotDestination: 'library' as const,
  draftRetentionDays: 30,
  videoDraftRetentionDays: 7,
  trashCleanupEnabled: false,
  trashRetentionDays: 30,
};
const LIBRARY_STORAGE_POLICY = {
  ...TEMPORARY_STORAGE_POLICY,
  defaultDestination: 'library' as const,
  recordingDestination: 'library' as const,
};

it('does not rewrite synchronized settings when the retired field is absent', async () => {
  resetSettingsStorageMocks();
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: { imageFormat: 'webp' },
  });

  await removeRetiredSynchronizedSettings();

  expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
});

it('saves and reloads a 100-action tree within the real sync per-item quota', async () => {
  resetSettingsStorageMocks();
  const stored: Record<string, unknown> = {};
  browserStorageSyncGetMock.mockImplementation(async (keys: string[]) =>
    Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]]))
  );
  browserStorageSyncSetMock.mockImplementation(async (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      if (new TextEncoder().encode(key + JSON.stringify(value)).length > 8192)
        throw new Error('QUOTA_BYTES_PER_ITEM exceeded');
    }
    const candidate = { ...stored, ...values };
    const total = Object.entries(candidate).reduce(
      (sum, [key, value]) => sum + new TextEncoder().encode(key + JSON.stringify(value)).length,
      0
    );
    if (total > 102400) throw new Error('QUOTA_BYTES exceeded');
    Object.assign(stored, values);
  });
  browserStorageSyncRemoveMock.mockImplementation(async (keys: string[]) => {
    for (const key of keys) delete stored[key];
  });
  const layout = {
    version: 2 as const,
    nodes: Array.from({ length: 100 }, (_, index) => ({
      type: 'command' as const,
      command: `sniptale.screenshots.quick-action.${index === 0 ? 'a'.repeat(513) : `action-${index}`}`,
      enabled: true,
    })),
  };
  await saveSettings({
    ...createDefaultSettings(),
    contextMenu: { ...DEFAULT_CONTEXT_MENU, layout },
  });
  expect(stored['sniptale_settings']).toHaveProperty('contextMenuLayoutChunks');
  expect((await loadSettings()).contextMenu.layout).toEqual(layout);
  const originalChunkKeys = Object.keys(stored).filter((key) =>
    key.startsWith('sniptale_context_menu_layout_')
  );
  await patchSettings({ imageQuality: 73 });
  expect((await loadSettings()).contextMenu.layout).toEqual(layout);
  expect(
    Object.keys(stored).filter((key) => key.startsWith('sniptale_context_menu_layout_'))
  ).toEqual(originalChunkKeys);
  await clearSettings();
  expect(stored).toEqual({});
});

it('keeps the previous settings readable when publishing chunked layout fails', async () => {
  resetSettingsStorageMocks();
  const previous = createDefaultSettings();
  const stored: Record<string, unknown> = { sniptale_settings: previous };
  browserStorageSyncGetMock.mockImplementation(async (keys: string[]) =>
    Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]]))
  );
  browserStorageSyncSetMock.mockImplementation(async (values: Record<string, unknown>) => {
    if ('sniptale_settings' in values) throw new Error('sync write failed');
    Object.assign(stored, values);
  });
  browserStorageSyncRemoveMock.mockImplementation(async (keys: string[]) => {
    for (const key of keys) delete stored[key];
  });
  const layout = {
    version: 2 as const,
    nodes: Array.from({ length: 100 }, (_, index) => ({
      type: 'command' as const,
      command: `sniptale.screenshots.quick-action.action-${index}`,
      enabled: true,
    })),
  };
  await expect(
    saveSettings({ ...previous, contextMenu: { ...previous.contextMenu, layout } })
  ).rejects.toThrow('sync write failed');
  expect(stored).toEqual({ sniptale_settings: previous });
  expect((await loadSettings()).contextMenu.layout).toEqual(previous.contextMenu.layout);
});

it('restores the previous manifest before deleting new chunks after a partially committed write', async () => {
  resetSettingsStorageMocks();
  const previous = createDefaultSettings();
  const stored: Record<string, unknown> = { sniptale_settings: previous };
  browserStorageSyncGetMock.mockImplementation(async (keys: string[]) =>
    Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]]))
  );
  let failed = false;
  browserStorageSyncSetMock.mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(stored, values);
    if ('sniptale_settings' in values && !failed) {
      failed = true;
      throw new Error('partially committed sync write');
    }
  });
  browserStorageSyncRemoveMock.mockImplementation(async (keys: string[]) => {
    for (const key of keys) delete stored[key];
  });
  const layout = {
    version: 2 as const,
    nodes: Array.from({ length: 100 }, (_, index) => ({
      type: 'command' as const,
      command: `sniptale.screenshots.quick-action.action-${index}`,
      enabled: true,
    })),
  };
  await expect(
    saveSettings({ ...previous, contextMenu: { ...previous.contextMenu, layout } })
  ).rejects.toThrow('partially committed sync write');
  expect(stored).toEqual({ sniptale_settings: previous });
  expect((await loadSettings()).contextMenu.layout).toEqual(previous.contextMenu.layout);
  expect(browserStorageSyncSetMock).toHaveBeenCalledWith(
    { sniptale_settings: previous },
    expect.anything()
  );
});

it('preserves newly published chunks when the failed settings write cannot be rolled back', async () => {
  resetSettingsStorageMocks();
  const previous = createDefaultSettings();
  const stored: Record<string, unknown> = { sniptale_settings: previous };
  browserStorageSyncGetMock.mockImplementation(async (keys: string[]) =>
    Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]]))
  );
  browserStorageSyncSetMock.mockImplementation(async (values: Record<string, unknown>) => {
    if ('sniptale_settings' in values) {
      if (values['sniptale_settings'] === previous) throw new Error('restore failed');
      Object.assign(stored, values);
      throw new Error('partially committed sync write');
    }
    Object.assign(stored, values);
  });
  const layout = {
    version: 2 as const,
    nodes: Array.from({ length: 100 }, (_, index) => ({
      type: 'command' as const,
      command: `sniptale.screenshots.quick-action.action-${index}`,
      enabled: true,
    })),
  };
  await expect(
    saveSettings({ ...previous, contextMenu: { ...previous.contextMenu, layout } })
  ).rejects.toThrow('Settings rollback could not be verified');
  expect(browserStorageSyncRemoveMock).not.toHaveBeenCalled();
  expect((await loadSettings()).contextMenu.layout).toEqual(layout);
});

it('reports an incomplete published layout instead of silently dropping commands', async () => {
  resetSettingsStorageMocks();
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: {
      contextMenu: DEFAULT_CONTEXT_MENU,
      contextMenuLayoutChunks: { version: 1, encoding: 'gzip', id: crypto.randomUUID(), count: 2 },
    },
  });
  await expect(loadSettings()).rejects.toThrow('incomplete or invalid');
  expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
});

it('removes only the retired synchronized diagnostics field', async () => {
  resetSettingsStorageMocks();
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: { imageFormat: 'webp', rawDiagnosticsEnabled: true },
  });

  await removeRetiredSynchronizedSettings();

  expect(browserStorageSyncSetMock).toHaveBeenCalledWith(
    {
      sniptale_settings: { imageFormat: 'webp' },
    },
    expect.anything()
  );
});

function resetSettingsStorageMocks() {
  vi.clearAllMocks();
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalRemoveMock.mockResolvedValue(undefined);
  browserStorageLocalSetMock.mockResolvedValue(undefined);
  browserStorageSyncGetMock.mockResolvedValue({});
  browserStorageSyncRemoveMock.mockResolvedValue(undefined);
  browserStorageSyncSetMock.mockResolvedValue(undefined);
}

async function verifySaveAndClearContracts() {
  const settings = {
    captureAction: 'edit' as const,
    contentToolbar: {
      displayMode: 'vertical' as const,
      compactMenus: true,
      position: { x: 240, y: 64 },
    },
    contextMenu: {
      enabled: true,
      showScreenshots: true,
      showVideo: false,
      showExport: true,
      showImageEditor: false,
      showVideoEditor: true,
      showGallery: true,
      showPageLinkCopy: true,
      showWindowResize: true,
      showSettings: false,
    },
    saveCapturesToGallery: true,
    viewportPresets: [],
    defaultViewportPresetId: 'custom',
    presets: [],
    defaultImagePresetId: 'image-1',
    defaultVideoPresetId: 'video-1',
    defaultExportPresetId: 'export-1',
    imageFormat: 'jpeg' as const,
    imageQuality: 80,
    ...PRIVACY_DEFAULTS,
  };

  await saveSettings(settings);
  await clearSettings();

  expect(browserStorageSyncSetMock).toHaveBeenCalledWith(
    { sniptale_settings: settings },
    expect.anything()
  );
  expect(browserStorageSyncRemoveMock).toHaveBeenCalledWith(
    ['sniptale_settings'],
    expect.anything()
  );
  expect(loggerDebugMock).toHaveBeenCalledWith('Saved settings payload');
  expect(loggerDebugMock).toHaveBeenCalledWith('Cleared settings payload');
}

async function verifyLoadMigration() {
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: {
      captureAction: 'download',
      saveCapturesToGallery: true,
      imageFormat: 'webp',
      imageQuality: 75,
      presets: 'not-an-array',
    },
  });

  await expect(loadSettings()).resolves.toEqual({
    captureAction: 'download_default',
    contentToolbar: DEFAULT_CONTENT_TOOLBAR,
    contextMenu: DEFAULT_CONTEXT_MENU,
    saveCapturesToGallery: true,
    viewportPresets: DEFAULT_VIEWPORT_PRESETS,
    defaultViewportPresetId: null,
    presets: [],
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultExportPresetId: null,
    imageFormat: 'webp',
    imageQuality: 75,
    localStoragePolicy: LIBRARY_STORAGE_POLICY,
    fullPageCapture: DEFAULT_FULL_PAGE_CAPTURE,
    fullPageQuality: DEFAULT_FULL_PAGE_QUALITY,
    exportResourceLimits: DEFAULT_EXPORT_RESOURCE_LIMITS,
    pagePackageCaptureTiming: DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING,
    voiceInput: DEFAULT_VOICE_INPUT,
    ...PRIVACY_DEFAULTS,
  });
  expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
}

async function verifyStoredSettings() {
  const storedViewportPresets = normalizeViewportPresetOrder([
    ...DEFAULT_VIEWPORT_PRESETS,
    {
      kind: 'user' as const,
      id: 'mobile',
      name: 'Mobile',
      target: 'window' as const,
      width: 390,
      height: 844,
      enabled: true,
      order: 9,
    },
  ]);
  const storedSettings = {
    captureAction: 'copy' as const,
    contentToolbar: {
      displayMode: 'vertical' as const,
      compactMenus: true,
      position: { x: 128, y: 24 },
    },
    contextMenu: {
      enabled: false,
      showScreenshots: true,
      showVideo: false,
      showExport: true,
      showImageEditor: false,
      showVideoEditor: true,
      showGallery: false,
      showPageLinkCopy: true,
      showWindowResize: true,
      showSettings: true,
    },
    saveCapturesToGallery: false,
    viewportPresets: storedViewportPresets,
    defaultViewportPresetId: 'mobile',
    presets: [],
    defaultImagePresetId: 'image-7',
    defaultVideoPresetId: 'video-7',
    defaultExportPresetId: 'export-7',
    imageFormat: 'png' as const,
    imageQuality: 100,
    localStoragePolicy: TEMPORARY_STORAGE_POLICY,
    fullPageCapture: DEFAULT_FULL_PAGE_CAPTURE,
    fullPageQuality: DEFAULT_FULL_PAGE_QUALITY,
    exportResourceLimits: DEFAULT_EXPORT_RESOURCE_LIMITS,
    pagePackageCaptureTiming: DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING,
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: false,
    externalSnapshotAssetRedirectsEnabled: false,
    externalSnapshotLinksEnabled: false,
    voiceInput: {
      language: 'en-US' as const,
      microphoneDeviceId: null,
      mode: 'browser-managed' as const,
    },
  };

  browserStorageSyncGetMock.mockResolvedValue({ sniptale_settings: storedSettings });
  browserStorageLocalGetMock.mockResolvedValue({
    sniptale_web_snapshot_local_consent: true,
  });
  await expect(loadSettings()).resolves.toEqual(storedSettings);
}

const invalidStoredSettingsFixture = {
  captureAction: 'invalid-action',
  contentToolbar: {
    displayMode: 'diagonal',
    compactMenus: 'sometimes',
    position: { x: 'left', y: 24 },
  },
  contextMenu: {
    enabled: 'yes',
    showScreenshots: true,
    showVideo: 7,
    showExport: false,
    showImageEditor: true,
    showVideoEditor: null,
    showGallery: true,
    showPageLinkCopy: 'sometimes',
    showSettings: false,
  },
  saveCapturesToGallery: true,
  viewportPresets: [
    {
      kind: 'user',
      id: 'mobile',
      name: 'Mobile',
      target: 'window',
      width: 390,
      height: 844,
      enabled: true,
      order: 0,
    },
    { id: 'broken-preset' },
  ],
  defaultViewportPresetId: 42,
  presets: [
    { id: 'preset-1', name: 'Screens', path: 'screens', enabled: true, order: 0 },
    { id: 'broken-save-preset' },
  ],
  defaultImagePresetId: 7,
  defaultVideoPresetId: 'video-9',
  defaultExportPresetId: null,
  imageFormat: 'gif',
  imageQuality: 'high',
  anonymousCrossOriginSnapshotAssetsEnabled: 'yes',
  authenticatedSnapshotAssetsEnabled: 'yes',
  externalSnapshotAssetRedirectsEnabled: 'yes',
  externalSnapshotLinksEnabled: 'yes',
  rawDiagnosticsEnabled: 'sometimes',
  voiceInput: { language: 'fr-FR', mode: 'always-local' },
};

const expectedInvalidStoredSettingsResult = {
  captureAction: 'download_default',
  contentToolbar: DEFAULT_CONTENT_TOOLBAR,
  contextMenu: {
    enabled: true,
    showScreenshots: true,
    showVideo: true,
    showExport: false,
    showImageEditor: true,
    showVideoEditor: false,
    showGallery: true,
    showPageLinkCopy: true,
    showWindowResize: false,
    showSettings: false,
  },
  saveCapturesToGallery: true,
  viewportPresets: DEFAULT_VIEWPORT_PRESETS,
  defaultViewportPresetId: null,
  presets: [{ id: 'preset-1', name: 'Screens', path: 'screens', enabled: true, order: 0 }],
  defaultImagePresetId: null,
  defaultVideoPresetId: 'video-9',
  defaultExportPresetId: null,
  imageFormat: 'png',
  imageQuality: 100,
  localStoragePolicy: LIBRARY_STORAGE_POLICY,
  fullPageCapture: DEFAULT_FULL_PAGE_CAPTURE,
  fullPageQuality: DEFAULT_FULL_PAGE_QUALITY,
  exportResourceLimits: DEFAULT_EXPORT_RESOURCE_LIMITS,
  pagePackageCaptureTiming: DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING,
  voiceInput: DEFAULT_VOICE_INPUT,
  ...PRIVACY_DEFAULTS,
};

async function verifyInvalidDrop() {
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: invalidStoredSettingsFixture,
  });

  await expect(loadSettings()).resolves.toEqual(expectedInvalidStoredSettingsResult);
  expect(loggerWarnMock).toHaveBeenCalledWith('Dropped invalid settings fields from storage', {
    invalidFieldCount: expect.any(Number),
  });
}

async function verifyInvalidRootFallback() {
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: 'invalid-root',
  });

  await expect(loadSettings()).resolves.toEqual({
    captureAction: 'download_default',
    contentToolbar: DEFAULT_CONTENT_TOOLBAR,
    contextMenu: DEFAULT_CONTEXT_MENU,
    saveCapturesToGallery: false,
    viewportPresets: DEFAULT_VIEWPORT_PRESETS,
    defaultViewportPresetId: null,
    presets: [],
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultExportPresetId: null,
    imageFormat: 'png',
    imageQuality: 100,
    localStoragePolicy: TEMPORARY_STORAGE_POLICY,
    fullPageCapture: DEFAULT_FULL_PAGE_CAPTURE,
    fullPageQuality: DEFAULT_FULL_PAGE_QUALITY,
    exportResourceLimits: DEFAULT_EXPORT_RESOURCE_LIMITS,
    pagePackageCaptureTiming: DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING,
    voiceInput: DEFAULT_VOICE_INPUT,
    ...PRIVACY_DEFAULTS,
  });

  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Ignoring invalid settings payload root from storage'
  );
}

describe('settings', () => {
  beforeEach(resetSettingsStorageMocks);

  it('saves and clears settings through the sync storage seam', verifySaveAndClearContracts);
  it('loads defaults and migrates the legacy download capture action', verifyLoadMigration);
  it('returns stored settings unchanged when all persisted fields are valid', verifyStoredSettings);
  it('drops invalid persisted settings fields and preserves valid entries', verifyInvalidDrop);
  it('falls back to defaults when the stored settings root is invalid', verifyInvalidRootFallback);
  it('keeps default settings stable when storage returns no payload', async () => {
    browserStorageSyncGetMock.mockResolvedValueOnce({});
    await expect(loadSettings()).resolves.toMatchObject({
      defaultViewportPresetId: null,
      imageFormat: 'png',
      localStoragePolicy: { trashCleanupEnabled: false, trashRetentionDays: 30 },
    });
  });

  it('preserves the explicit trash cleanup choice independently of draft cleanup on load', async () => {
    browserStorageSyncGetMock.mockResolvedValueOnce({
      sniptale_settings: {
        localStoragePolicy: {
          cleanupEnabled: false,
          trashCleanupEnabled: true,
          trashRetentionDays: 7,
        },
      },
    });
    await expect(loadSettings()).resolves.toMatchObject({
      localStoragePolicy: {
        cleanupEnabled: false,
        trashCleanupEnabled: true,
        trashRetentionDays: 7,
      },
    });
    expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
  });

  it('drops an excessive or non-finite full-page policy from storage without repairing it', async () => {
    browserStorageSyncGetMock.mockResolvedValueOnce({
      sniptale_settings: {
        fullPageQuality: {
          maxFileSizeMiB: Infinity,
          maxMegapixels: 81,
          minScalePercent: 0,
          profile: 'custom',
        },
      },
    });

    await expect(loadSettings()).resolves.toMatchObject({
      fullPageQuality: DEFAULT_FULL_PAGE_QUALITY,
    });
    expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith('Dropped invalid settings fields from storage', {
      invalidFieldCount: 1,
    });
  });

  it('normalizes legacy voice preferences with the default microphone selection', async () => {
    browserStorageSyncGetMock.mockResolvedValueOnce({
      sniptale_settings: { voiceInput: { language: 'en-US', mode: 'browser-managed' } },
    });
    await expect(loadSettings()).resolves.toMatchObject({
      voiceInput: {
        language: 'en-US',
        microphoneDeviceId: null,
        mode: 'browser-managed',
      },
    });
    expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
  });

  it('drops a revision-1 size catalog and restores the current window catalog', async () => {
    const legacyCatalog = createSystemViewportPresetCatalog()
      .filter((preset) => preset.id !== 'system:window-full-hd')
      .map((preset) => ({ ...preset, catalogRevision: 1 }));
    const userPreset = {
      kind: 'user' as const,
      id: 'user-wide',
      name: 'Wide',
      target: 'window' as const,
      width: 1600,
      height: 900,
      enabled: true,
      order: 5,
    };
    browserStorageSyncGetMock.mockResolvedValue({
      sniptale_settings: {
        viewportPresets: [...legacyCatalog.slice(0, 5), userPreset, ...legacyCatalog.slice(5)],
        defaultViewportPresetId: userPreset.id,
      },
    });

    const settings = await loadSettings();

    expect(settings.viewportPresets).toContainEqual(
      expect.objectContaining({ id: 'system:window-full-hd', width: 1920, height: 1080 })
    );
    expect(settings.viewportPresets).not.toContainEqual(
      expect.objectContaining({ id: userPreset.id })
    );
    expect(settings.defaultViewportPresetId).toBeNull();
    expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
  });
});

it('reads a custom layout without writes and preserves explicit legacy visibility', async () => {
  const layout = createContextMenuLayout();
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: { contextMenu: { layout, showWindowResize: true } },
  });
  browserStorageSyncSetMock.mockClear();
  const loaded = await loadSettings();
  expect(loaded.contextMenu.layout).toEqual(layout);
  expect(loaded.contextMenu.showWindowResize).toBe(true);
  expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
  if (loaded.contextMenu.layout?.version !== 1) throw new Error('Expected legacy layout');
  loaded.contextMenu.layout.sections[0]!.items.length = 0;
  expect((await loadSettings()).contextMenu.layout).toEqual(layout);
});

it('reads a v2 layout as the saved authority without writing on load', async () => {
  const layout = {
    version: 2,
    nodes: [
      { type: 'command', command: 'sniptale.video.tab', enabled: true },
      { type: 'command', command: 'sniptale.screenshots.quick-action.unavailable', enabled: false },
    ],
  };
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: { contextMenu: { layout, showVideo: false } },
  });
  browserStorageSyncSetMock.mockClear();
  const loaded = await loadSettings();
  expect(loaded.contextMenu.layout).toEqual(layout);
  expect(loaded.contextMenu.showVideo).toBe(false);
  expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
});

it('drops a malformed stored layout without changing valid booleans or repairing storage', async () => {
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: { contextMenu: { enabled: false, layout: { version: 9 } } },
  });
  browserStorageSyncSetMock.mockClear();
  const loaded = await loadSettings();
  expect(loaded.contextMenu.enabled).toBe(false);
  expect(loaded.contextMenu.layout).toBeUndefined();
  expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
});

it('salvages valid nodes from a partially damaged stored v2 layout without writing on read', async () => {
  browserStorageSyncGetMock.mockResolvedValue({
    sniptale_settings: {
      contextMenu: {
        enabled: true,
        layout: {
          version: 2,
          nodes: [
            { type: 'command', command: 'sniptale.video.tab', enabled: false },
            { type: 'command', command: 'unknown.command', enabled: true },
            { type: 'command', command: 'sniptale.gallery', enabled: true },
          ],
        },
      },
    },
  });
  browserStorageSyncSetMock.mockClear();
  const loaded = await loadSettings();
  expect(loaded.contextMenu.layout).toEqual({
    version: 2,
    nodes: [
      { type: 'command', command: 'sniptale.video.tab', enabled: false },
      { type: 'command', command: 'sniptale.gallery', enabled: true },
    ],
  });
  expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
});
