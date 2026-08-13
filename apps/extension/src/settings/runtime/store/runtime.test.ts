import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadSettings = vi.fn();
const mockPatchSettings = vi.fn();
const mockResetSettingsToDefaults = vi.fn();

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal()),
  DEFAULT_SETTINGS: {
    captureAction: 'download_default',
    contentToolbar: {
      displayMode: 'horizontal',
      compactMenus: false,
      position: null,
    },
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
    viewportPresets: [
      {
        kind: 'user',
        id: 'fhd',
        name: 'Full HD',
        target: 'window',
        width: 1920,
        height: 1080,
        enabled: true,
        order: 0,
      },
      {
        kind: 'user',
        id: 'hd',
        name: 'HD',
        target: 'window',
        width: 1280,
        height: 720,
        enabled: true,
        order: 0,
      },
    ],
    defaultViewportPresetId: 'native',
    presets: [],
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultExportPresetId: null,
    imageFormat: 'png',
    imageQuality: 100,
    authenticatedSnapshotAssetsEnabled: false,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
  },
  loadSettings: mockLoadSettings,
  patchSettings: mockPatchSettings,
  resetSettingsToDefaults: mockResetSettingsToDefaults,
}));

function createSettingsFixture() {
  return {
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
    authenticatedSnapshotAssetsEnabled: false,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
  };
}

async function verifyRuntimeUpdatePassesThroughSharedStorage() {
  const { updateSettingsRuntimeState } = await import('./runtime');
  mockPatchSettings.mockResolvedValueOnce({
    ...createSettingsFixture(),
    imageQuality: 80,
    contextMenu: {
      enabled: false,
      showScreenshots: true,
      showVideo: false,
      showExport: true,
      showImageEditor: true,
      showVideoEditor: false,
      showGallery: true,
      showPageLinkCopy: true,
      showSettings: true,
    },
  });

  const nextSettings = await updateSettingsRuntimeState({
    imageQuality: 80,
    contextMenu: {
      enabled: false,
      showScreenshots: true,
      showVideo: false,
      showExport: true,
      showImageEditor: true,
      showVideoEditor: false,
      showGallery: true,
      showPageLinkCopy: true,
      showSettings: true,
    },
  });

  expect(nextSettings.imageQuality).toBe(80);
  expect(nextSettings.contextMenu.enabled).toBe(false);
  expect(mockPatchSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      imageQuality: 80,
      contextMenu: expect.objectContaining({
        enabled: false,
        showVideo: false,
      }),
    })
  );
}

async function verifyRuntimeResetUsesDefaultSeam() {
  const { DEFAULT_SETTINGS, resetSettingsRuntimeState } = await import('./runtime');
  mockResetSettingsToDefaults.mockResolvedValueOnce(DEFAULT_SETTINGS);

  const settings = await resetSettingsRuntimeState();

  expect(settings).toEqual(DEFAULT_SETTINGS);
  expect(mockResetSettingsToDefaults).toHaveBeenCalledTimes(1);
}

function runSettingsRuntimeWriteSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    'passes runtime updates through to shared storage without AI fields',
    verifyRuntimeUpdatePassesThroughSharedStorage
  );
  it('resets runtime settings back to the runtime defaults', verifyRuntimeResetUsesDefaultSeam);
}

function runSettingsRuntimeReadSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates runtime load to shared storage seam', async () => {
    const { loadSettingsRuntimeState } = await import('./runtime');
    mockLoadSettings.mockResolvedValue({
      captureAction: 'copy',
      contextMenu: {
        enabled: true,
        showScreenshots: true,
        showVideo: true,
        showExport: true,
        showImageEditor: true,
        showVideoEditor: true,
        showGallery: false,
        showPageLinkCopy: true,
        showSettings: true,
      },
      saveCapturesToGallery: true,
      viewportPresets: [],
      presets: [],
      defaultImagePresetId: null,
      defaultVideoPresetId: null,
      defaultExportPresetId: null,
      imageFormat: 'jpeg',
      imageQuality: 90,
      authenticatedSnapshotAssetsEnabled: false,
      anonymousCrossOriginSnapshotAssetsEnabled: false,
      skipWebSnapshotSaveDisclosure: false,
      rawDiagnosticsEnabled: false,
    });

    const settings = await loadSettingsRuntimeState();

    expect(settings).toEqual(
      expect.objectContaining({
        captureAction: 'copy',
        imageFormat: 'jpeg',
      })
    );
  });
}

describe('settings runtime writes', runSettingsRuntimeWriteSuite);
describe('settings runtime reads', runSettingsRuntimeReadSuite);
