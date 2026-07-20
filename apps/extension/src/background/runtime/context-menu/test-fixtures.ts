export const contextMenuSettingsFixture = {
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
  defaultExportPresetId: null,
  defaultImagePresetId: null,
  defaultVideoPresetId: 'preset-default',
  defaultViewportId: 'native',
  imageFormat: 'png' as const,
  imageQuality: 100,
  authenticatedSnapshotAssetsEnabled: true,
  anonymousCrossOriginSnapshotAssetsEnabled: false,
  skipWebSnapshotSaveDisclosure: false,
  rawDiagnosticsEnabled: false,
  presets: [],
  saveCapturesToGallery: false,
  viewportPresets: [
    { id: 'preset-default', width: 1440, height: 900, label: 'Default' },
    { id: 'preset-alt', width: 1920, height: 1080, label: 'Full HD' },
  ],
};

export const contextMenuVideoSettingsFixture = {
  autoFadeDelay: 3,
  countdownSeconds: 3,
  diagnosticsEnabled: false,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  openEditorAfterRecording: false,
  quality: 'HIGH',
  systemAudioEnabled: true,
};

export const contextMenuPopupExportPreferencesFixture = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: false,
  includeHarDomLogs: false,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
};
