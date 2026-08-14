export type FullPageFloatingElementsMode = 'hide' | 'once' | 'repeat';

export interface FullPageCapturePreferences {
  floatingElements: FullPageFloatingElementsMode;
  freezeMotion: boolean;
  preloadLazyContent: boolean;
}

export type FullPageCaptureBackendKind = 'native';
export type FullPageExportCaptureAction = 'EXPORT_CAPTURE_FULL_PAGE';

export interface FullPageExportCaptureIdentity {
  action: FullPageExportCaptureAction;
  exportRunId: string;
}
export type FullPageCaptureRootKind = 'document' | 'element' | 'viewport';

export interface FullPageCaptureRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface FullPageCaptureGeometry {
  devicePixelRatio: number;
  extentHeight: number;
  extentWidth: number;
  outputHeight: number;
  outputWidth: number;
  rootKind: FullPageCaptureRootKind;
  rootViewport: FullPageCaptureRect;
  viewportHeight: number;
  viewportWidth: number;
}

export interface FullPageCaptureSessionIdentity {
  jobId: string;
  ownerToken: string;
  runtimeGeneration: string;
}

export interface FullPageCaptureTileIdentity extends FullPageCaptureSessionIdentity {
  column: number;
  firstColumn: boolean;
  firstRow: boolean;
  lastColumn: boolean;
  lastRow: boolean;
  row: number;
  targetX: number;
  targetY: number;
}

export interface FullPageCaptureTileState {
  actualX: number;
  actualY: number;
  frozenExtentWarning: boolean;
  geometry: FullPageCaptureGeometry;
  layoutGeneration: string;
}

export interface FullPageCapturePrepareResult extends FullPageCaptureTileState {
  warnings: string[];
}

export interface FullPageCaptureMetadata {
  cssHeight: number;
  cssWidth: number;
  downscaled: boolean;
  frozenExtentWarning: boolean;
  outputHeight: number;
  outputScale: number;
  outputWidth: number;
  warnings: string[];
}

export const DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES: FullPageCapturePreferences = {
  floatingElements: 'once',
  freezeMotion: true,
  preloadLazyContent: true,
};
