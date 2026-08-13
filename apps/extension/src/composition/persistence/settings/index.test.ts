import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserStorageSyncGetMock,
  browserStorageSyncRemoveMock,
  browserStorageSyncSetMock,
  loggerDebugMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  browserStorageSyncGetMock: vi.fn(),
  browserStorageSyncRemoveMock: vi.fn(),
  browserStorageSyncSetMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
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

import { clearSettings, loadSettings, saveSettings } from './index';
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
  showImageEditor: true,
  showVideoEditor: true,
  showGallery: true,
  showPageLinkCopy: true,
  showWindowResize: true,
  showSettings: true,
};
const DEFAULT_VIEWPORT_PRESETS = createSystemViewportPresetCatalog();
const PRIVACY_DEFAULTS = {
  anonymousCrossOriginSnapshotAssetsEnabled: false,
  authenticatedSnapshotAssetsEnabled: false,
  skipWebSnapshotSaveDisclosure: false,
  rawDiagnosticsEnabled: false,
};
const DEFAULT_FULL_PAGE_CAPTURE = {
  floatingElements: 'once' as const,
  freezeMotion: true,
  preloadLazyContent: true,
};
const DEFAULT_VOICE_INPUT = {
  language: 'ru-RU' as const,
  microphoneDeviceId: null,
  mode: 'local-first' as const,
};
const TEMPORARY_STORAGE_POLICY = {
  cleanupEnabled: true,
  defaultDestination: 'temporary' as const,
  draftRetentionDays: 30,
  videoDraftRetentionDays: 7,
};
const LIBRARY_STORAGE_POLICY = {
  ...TEMPORARY_STORAGE_POLICY,
  defaultDestination: 'library' as const,
};

function resetSettingsStorageMocks() {
  vi.clearAllMocks();
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

  expect(browserStorageSyncSetMock).toHaveBeenCalledWith({ sniptale_settings: settings });
  expect(browserStorageSyncRemoveMock).toHaveBeenCalledWith(['sniptale_settings']);
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
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: true,
    rawDiagnosticsEnabled: true,
    voiceInput: {
      language: 'en-US' as const,
      microphoneDeviceId: null,
      mode: 'browser-managed' as const,
    },
  };

  browserStorageSyncGetMock.mockResolvedValue({ sniptale_settings: storedSettings });
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
  skipWebSnapshotSaveDisclosure: 'yes',
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
    showVideoEditor: true,
    showGallery: true,
    showPageLinkCopy: true,
    showWindowResize: true,
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
