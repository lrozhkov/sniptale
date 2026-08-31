export interface PopupExportPreferences {
  includeAnnotations: boolean;
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includeViewportScreenshot?: boolean;
  includePageDiagnostics: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
}

export interface PopupPagePackageSelection extends PopupExportPreferences {
  includeWebCopy: boolean;
}

export interface PopupPagePackagePreferences {
  export: PopupPagePackageSelection;
  save: PopupPagePackageSelection;
}
