import {
  DEFAULT_FULL_PAGE_QUALITY_POLICY,
  FULL_PAGE_QUALITY_ABSOLUTE_LIMITS,
  type FullPageCaptureGeometry,
  type FullPageQualityPolicy,
} from '../../../contracts/full-page-capture';

export const MAX_RASTER_SIDE_PX = FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxRasterSidePx;
export const MAX_WORKING_SET_BYTES = FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxWorkingSetBytes;
export const BYTES_PER_PIXEL = 4;
export const FULL_PAGE_RASTER_BUDGET_ERROR =
  'Full-page screenshot exceeds the configured quality limits';
export const FULL_PAGE_FILE_BUDGET_ERROR =
  'Full-page screenshot exceeds the configured maximum file size';

export function resolveFullPageRasterBudget(
  policy: FullPageQualityPolicy = DEFAULT_FULL_PAGE_QUALITY_POLICY
) {
  return {
    maxEncodedBytes: policy.maxFileSizeMiB * 1024 * 1024,
    maxRasterAreaPx: policy.maxMegapixels * 1_000_000,
    minOutputScale: policy.minScalePercent / 100,
  };
}

const GEOMETRY_FIELDS = [
  'devicePixelRatio',
  'extentHeight',
  'extentWidth',
  'outputHeight',
  'outputWidth',
  'viewportHeight',
  'viewportWidth',
] as const satisfies ReadonlyArray<keyof FullPageCaptureGeometry>;

/** Rejects hostile page-derived dimensions before tile-plan or bitmap allocation. */
export function assertFullPageGeometryBudget(
  geometry: FullPageCaptureGeometry,
  policy: FullPageQualityPolicy = DEFAULT_FULL_PAGE_QUALITY_POLICY
): void {
  for (const field of GEOMETRY_FIELDS) {
    const value = geometry[field];
    if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
      throw new Error('Full-page screenshot geometry is invalid');
    }
  }
  const viewport = geometry.rootViewport;
  if (
    !Number.isFinite(viewport.x) ||
    viewport.x < 0 ||
    !Number.isFinite(viewport.y) ||
    viewport.y < 0 ||
    !Number.isFinite(viewport.width) ||
    viewport.width <= 0 ||
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0
  ) {
    throw new Error('Full-page screenshot geometry is invalid');
  }

  const budget = resolveFullPageRasterBudget(policy);
  const minimumWidth = Math.floor(geometry.outputWidth * budget.minOutputScale);
  const minimumHeight = Math.floor(geometry.outputHeight * budget.minOutputScale);
  const minimumArea = minimumWidth * minimumHeight;
  if (
    minimumWidth > MAX_RASTER_SIDE_PX ||
    minimumHeight > MAX_RASTER_SIDE_PX ||
    minimumArea > budget.maxRasterAreaPx ||
    minimumArea * BYTES_PER_PIXEL > MAX_WORKING_SET_BYTES
  ) {
    throw new Error(FULL_PAGE_RASTER_BUDGET_ERROR);
  }
}
