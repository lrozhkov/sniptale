import type { FullPageCaptureGeometry } from '../../../contracts/full-page-capture';

export const MAX_RASTER_SIDE_PX = 32_768;
export const MAX_RASTER_AREA_PX = 64_000_000;
export const MAX_WORKING_SET_BYTES = 384 * 1024 * 1024;
export const MIN_OUTPUT_SCALE = 0.5;
export const BYTES_PER_PIXEL = 4;

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
export function assertFullPageGeometryBudget(geometry: FullPageCaptureGeometry): void {
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

  const minimumWidth = Math.floor(geometry.outputWidth * MIN_OUTPUT_SCALE);
  const minimumHeight = Math.floor(geometry.outputHeight * MIN_OUTPUT_SCALE);
  const minimumArea = minimumWidth * minimumHeight;
  if (
    minimumWidth > MAX_RASTER_SIDE_PX ||
    minimumHeight > MAX_RASTER_SIDE_PX ||
    minimumArea > MAX_RASTER_AREA_PX ||
    minimumArea * BYTES_PER_PIXEL > MAX_WORKING_SET_BYTES
  ) {
    throw new Error('Full-page screenshot exceeds raster memory or dimension limits');
  }
}
