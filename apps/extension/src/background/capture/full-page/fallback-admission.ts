import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import type { FullPageQualityPolicy } from '../../../contracts/full-page-capture';
import { FULL_PAGE_QUALITY_ABSOLUTE_LIMITS } from '../../../contracts/full-page-capture';
import {
  BYTES_PER_PIXEL,
  FULL_PAGE_FILE_BUDGET_ERROR,
  FULL_PAGE_RASTER_BUDGET_ERROR,
  resolveFullPageRasterBudget,
} from './budgets';

const PNG_HEADER_BYTES = 24;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function readPngDimensions(header: Uint8Array): { height: number; width: number } | null {
  if (
    header.byteLength < PNG_HEADER_BYTES ||
    PNG_SIGNATURE.some((value, index) => header[index] !== value) ||
    String.fromCharCode(header[12]!, header[13]!, header[14]!, header[15]!) !== 'IHDR'
  ) {
    return null;
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { height, width } : null;
}

/** Admits the browser-produced PNG fallback without allocating its decoded raster. */
export async function assertFullPageViewportFallbackWithinPolicy(args: {
  dataUrl: string;
  policy: FullPageQualityPolicy;
  signal?: AbortSignal | undefined;
}): Promise<{ height: number; width: number }> {
  const blob = await dataUrlToBlob(args.dataUrl, args.signal);
  const budget = resolveFullPageRasterBudget(args.policy);
  if (blob.type !== 'image/png' || blob.size <= 0 || blob.size > budget.maxEncodedBytes) {
    throw new Error(FULL_PAGE_FILE_BUDGET_ERROR);
  }
  const dimensions = readPngDimensions(
    new Uint8Array(await blob.slice(0, PNG_HEADER_BYTES).arrayBuffer())
  );
  if (!dimensions) throw new Error(FULL_PAGE_RASTER_BUDGET_ERROR);
  const area = dimensions.width * dimensions.height;
  if (
    dimensions.width > FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxRasterSidePx ||
    dimensions.height > FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxRasterSidePx ||
    area > budget.maxRasterAreaPx ||
    area * BYTES_PER_PIXEL > FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxWorkingSetBytes
  ) {
    throw new Error(FULL_PAGE_RASTER_BUDGET_ERROR);
  }
  return dimensions;
}
