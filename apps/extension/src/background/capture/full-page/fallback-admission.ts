import {
  finalizeScreenshotDataUrl,
  optimizeScreenshotBlob,
} from '../../../platform/media-utils/screenshot-encoding';
import { blobToDataUrl, dataUrlToBlob } from '../../../platform/media-utils/data-url';
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

/** Check the native PNG source before final encoding and file-size admission. */
export async function assertFullPageViewportFallbackWithinPolicy(args: {
  dataUrl: string;
  policy: FullPageQualityPolicy;
  signal?: AbortSignal | undefined;
  outputPurpose?: 'appearance-source';
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
}): Promise<{ height: number; width: number; dataUrl?: string }> {
  const blob = await dataUrlToBlob(args.dataUrl, args.signal);
  const budget = resolveFullPageRasterBudget(args.policy);
  const maxEncodedBytes =
    args.outputPurpose === 'appearance-source'
      ? FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxFileSizeMiB * 1024 * 1024
      : budget.maxEncodedBytes;
  if (
    blob.type !== 'image/png' ||
    blob.size <= 0 ||
    blob.size > FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxFileSizeMiB * 1024 * 1024
  ) {
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
  if (
    args.outputPurpose !== 'appearance-source' &&
    args.format !== undefined &&
    args.format !== 'png'
  ) {
    const dataUrl = await finalizeScreenshotDataUrl(args.dataUrl, {
      format: args.format,
      quality: (args.quality ?? 1) * 100,
      ...(args.signal === undefined ? {} : { signal: args.signal }),
    });
    args.signal?.throwIfAborted();
    const encoded = await dataUrlToBlob(dataUrl, args.signal);
    args.signal?.throwIfAborted();
    if (encoded.size > maxEncodedBytes) throw new Error(FULL_PAGE_FILE_BUDGET_ERROR);
    return { ...dimensions, dataUrl };
  }
  const output =
    args.outputPurpose === 'appearance-source'
      ? blob
      : await optimizeScreenshotBlob(blob, args.signal);
  args.signal?.throwIfAborted();
  if (output.size > maxEncodedBytes) throw new Error(FULL_PAGE_FILE_BUDGET_ERROR);
  return output === blob ? dimensions : { ...dimensions, dataUrl: await blobToDataUrl(output) };
}
