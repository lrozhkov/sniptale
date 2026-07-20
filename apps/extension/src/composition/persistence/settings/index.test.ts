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
  showSettings: true,
};
const DEFAULT_VIEWPORT_PRESETS = [
  { id: 'fhd', width: 1920, height: 1080, label: 'Full HD' },
  { id: 'hd', width: 1280, height: 720, label: 'HD' },
];
const PRIVACY_DEFAULTS = {
  anonymousCrossOriginSnapshotAssetsEnabled: false,
  authenticatedSnapshotAssetsEnabled: false,
  skipWebSnapshotSaveDisclosure: false,
  rawDiagnosticsEnabled: false,
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
      showSettings: false,
    },
    saveCapturesToGallery: true,
    viewportPresets: [],
    defaultViewportId: 'custom',
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
    defaultViewportId: 'native',
    presets: [],
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultExportPresetId: null,
    imageFormat: 'webp',
    imageQuality: 75,
    ...PRIVACY_DEFAULTS,
  });
}

async function verifyStoredSettings() {
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
      showSettings: true,
    },
    saveCapturesToGallery: false,
    viewportPresets: [{ id: 'mobile', width: 390, height: 844, label: 'Mobile' }],
    defaultViewportId: 'mobile',
    presets: [],
    defaultImagePresetId: 'image-7',
    defaultVideoPresetId: 'video-7',
    defaultExportPresetId: 'export-7',
    imageFormat: 'png' as const,
    imageQuality: 100,
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: true,
    rawDiagnosticsEnabled: true,
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
    { id: 'mobile', width: 390, height: 844, label: 'Mobile' },
    { id: 'broken-preset' },
  ],
  defaultViewportId: 42,
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
    showSettings: false,
  },
  saveCapturesToGallery: true,
  viewportPresets: [{ id: 'mobile', width: 390, height: 844, label: 'Mobile' }],
  defaultViewportId: 'native',
  presets: [{ id: 'preset-1', name: 'Screens', path: 'screens', enabled: true, order: 0 }],
  defaultImagePresetId: null,
  defaultVideoPresetId: 'video-9',
  defaultExportPresetId: null,
  imageFormat: 'png',
  imageQuality: 100,
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
    defaultViewportId: 'native',
    presets: [],
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultExportPresetId: null,
    imageFormat: 'png',
    imageQuality: 100,
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
      defaultViewportId: 'native',
      imageFormat: 'png',
    });
  });
});
