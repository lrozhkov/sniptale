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

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFullPageCaptureRect(value: unknown): value is FullPageCaptureRect {
  if (typeof value !== 'object' || value === null) return false;
  const rect = value as Record<string, unknown>;
  return (
    isFinitePositiveNumber(rect['height']) &&
    isFinitePositiveNumber(rect['width']) &&
    isFiniteNonNegativeNumber(rect['x']) &&
    isFiniteNonNegativeNumber(rect['y'])
  );
}

export function isFullPageCaptureGeometry(value: unknown): value is FullPageCaptureGeometry {
  if (typeof value !== 'object' || value === null) return false;
  const geometry = value as Record<string, unknown>;
  return (
    isFinitePositiveNumber(geometry['devicePixelRatio']) &&
    isFinitePositiveNumber(geometry['extentHeight']) &&
    isFinitePositiveNumber(geometry['extentWidth']) &&
    isFinitePositiveNumber(geometry['outputHeight']) &&
    isFinitePositiveNumber(geometry['outputWidth']) &&
    (geometry['rootKind'] === 'document' ||
      geometry['rootKind'] === 'element' ||
      geometry['rootKind'] === 'viewport') &&
    isFullPageCaptureRect(geometry['rootViewport']) &&
    isFinitePositiveNumber(geometry['viewportHeight']) &&
    isFinitePositiveNumber(geometry['viewportWidth'])
  );
}

export type FullPageCaptureRasterCoordinateSpace =
  | 'document'
  | 'root-content'
  | 'viewport'
  | 'viewport-shell';

export interface FullPageCaptureRasterRegion extends FullPageCaptureRect {
  coordinateSpace: FullPageCaptureRasterCoordinateSpace;
}

function toRasterRect(region: FullPageCaptureRasterRegion): FullPageCaptureRect {
  return { height: region.height, width: region.width, x: region.x, y: region.y };
}

function projectRootContentRasterRegion(
  region: FullPageCaptureRasterRegion,
  geometry: FullPageCaptureGeometry
): FullPageCaptureRect | null {
  if (geometry.rootKind !== 'element') return null;
  return {
    height: region.height,
    width: region.width,
    x: geometry.rootViewport.x + region.x,
    y: geometry.rootViewport.y + region.y,
  };
}

function projectViewportShellRasterRegion(
  region: FullPageCaptureRasterRegion,
  geometry: FullPageCaptureGeometry
): FullPageCaptureRect | null {
  if (geometry.rootKind !== 'element') return null;
  const rect = toRasterRect(region);
  const viewport = geometry.rootViewport;
  if (region.y + region.height <= viewport.y) return rect;
  if (region.y >= viewport.y + viewport.height) {
    return { ...rect, y: region.y + geometry.extentHeight - viewport.height };
  }
  if (region.x + region.width <= viewport.x) return rect;
  if (region.x >= viewport.x + viewport.width) {
    return { ...rect, x: region.x + geometry.extentWidth - viewport.width };
  }
  return null;
}

export function projectFullPageCaptureRasterRegion(
  region: FullPageCaptureRasterRegion,
  geometry: FullPageCaptureGeometry
): FullPageCaptureRect | null {
  if (region.coordinateSpace === 'root-content') {
    return projectRootContentRasterRegion(region, geometry);
  }
  if (region.coordinateSpace === 'viewport-shell') {
    return projectViewportShellRasterRegion(region, geometry);
  }
  if (region.coordinateSpace !== geometry.rootKind) return null;
  return toRasterRect(region);
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
  captureGeometry?: FullPageCaptureGeometry;
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
