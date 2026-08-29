import {
  DEFAULT_FULL_PAGE_QUALITY_POLICY,
  FULL_PAGE_QUALITY_ABSOLUTE_LIMITS,
  type FullPageQualityPolicy,
} from '../../../contracts/full-page-capture';
import { BYTES_PER_PIXEL, FULL_PAGE_FILE_BUDGET_ERROR } from './budgets';

const ENCODED_RETRY_SAFETY_RATIO = 0.9;

export function resolveReducedExportPolicy(
  policy: FullPageQualityPolicy | undefined,
  error: Error
): FullPageQualityPolicy {
  const resolved = policy ?? DEFAULT_FULL_PAGE_QUALITY_POLICY;
  const encodedPixelCeiling = Math.max(
    FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.minMegapixels,
    Math.floor(
      (resolved.maxFileSizeMiB * 1024 * 1024 * ENCODED_RETRY_SAFETY_RATIO) /
        (BYTES_PER_PIXEL * 1_000_000)
    )
  );
  return {
    ...resolved,
    maxMegapixels:
      error.message === FULL_PAGE_FILE_BUDGET_ERROR
        ? Math.min(resolved.maxMegapixels, encodedPixelCeiling)
        : resolved.maxMegapixels,
    minScalePercent: FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.minScalePercent,
    profile: 'custom',
  };
}
