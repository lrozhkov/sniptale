export type FullPageFloatingElementsMode = 'hide' | 'once' | 'repeat';

export type FullPageQualityProfile = 'safe' | 'high-quality' | 'custom';

export interface FullPageQualityPolicy {
  maxFileSizeMiB: number;
  maxMegapixels: number;
  minScalePercent: number;
  profile: FullPageQualityProfile;
}

export const FULL_PAGE_QUALITY_ABSOLUTE_LIMITS = {
  maxFileSizeMiB: 128,
  maxMegapixels: 80,
  maxRasterSidePx: 32_768,
  maxWorkingSetBytes: 384 * 1024 * 1024,
  minFileSizeMiB: 8,
  minMegapixels: 8,
  minScalePercent: 10,
} as const;

export const FULL_PAGE_QUALITY_PROFILES = {
  safe: {
    maxFileSizeMiB: 64,
    maxMegapixels: 64,
    minScalePercent: 50,
    profile: 'safe',
  },
  'high-quality': {
    maxFileSizeMiB: 96,
    maxMegapixels: 80,
    minScalePercent: 75,
    profile: 'high-quality',
  },
} as const satisfies Record<Exclude<FullPageQualityProfile, 'custom'>, FullPageQualityPolicy>;

export const DEFAULT_FULL_PAGE_QUALITY_POLICY: FullPageQualityPolicy =
  FULL_PAGE_QUALITY_PROFILES.safe;

function isFiniteIntegerInRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

export function parseFullPageQualityPolicy(value: unknown): FullPageQualityPolicy | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) =>
        key !== 'profile' &&
        key !== 'maxMegapixels' &&
        key !== 'minScalePercent' &&
        key !== 'maxFileSizeMiB'
    )
  ) {
    return null;
  }
  const profile = record['profile'];
  if (profile === 'safe' || profile === 'high-quality') {
    const expected = FULL_PAGE_QUALITY_PROFILES[profile];
    return record['maxMegapixels'] === expected.maxMegapixels &&
      record['minScalePercent'] === expected.minScalePercent &&
      record['maxFileSizeMiB'] === expected.maxFileSizeMiB
      ? { ...expected }
      : null;
  }
  const limits = FULL_PAGE_QUALITY_ABSOLUTE_LIMITS;
  if (
    profile !== 'custom' ||
    !isFiniteIntegerInRange(record['maxMegapixels'], limits.minMegapixels, limits.maxMegapixels) ||
    !isFiniteIntegerInRange(record['minScalePercent'], limits.minScalePercent, 100) ||
    !isFiniteIntegerInRange(record['maxFileSizeMiB'], limits.minFileSizeMiB, limits.maxFileSizeMiB)
  ) {
    return null;
  }
  return {
    maxFileSizeMiB: record['maxFileSizeMiB'],
    maxMegapixels: record['maxMegapixels'],
    minScalePercent: record['minScalePercent'],
    profile,
  };
}

export function resolveFullPageQualityProfile(
  profile: Exclude<FullPageQualityProfile, 'custom'>
): FullPageQualityPolicy {
  return { ...FULL_PAGE_QUALITY_PROFILES[profile] };
}

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
  viewportFallback?: boolean;
  warnings: string[];
}

export const DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES: FullPageCapturePreferences = {
  floatingElements: 'once',
  freezeMotion: true,
  preloadLazyContent: true,
};
