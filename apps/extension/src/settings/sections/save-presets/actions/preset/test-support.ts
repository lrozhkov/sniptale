import type { Settings } from '../../../../../contracts/settings';

export function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    captureAction: 'download_default',
    contextMenu: {
      enabled: true,
      showExport: true,
      showGallery: true,
      showImageEditor: true,
      showPageLinkCopy: true,
      showScreenshots: true,
      showSettings: true,
      showVideo: true,
      showVideoEditor: true,
    },
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    imageFormat: 'png',
    imageQuality: 100,
    presets: [],
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    saveCapturesToGallery: false,
    ...overrides,
  };
}
