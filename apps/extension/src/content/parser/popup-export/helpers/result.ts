import type { ExportResult, PopupExportResult } from '@sniptale/runtime-contracts/export';

export function mapPopupExportResult(
  result: ExportResult,
  extraErrors: string[] = []
): PopupExportResult {
  const errors = [...result.errors, ...extraErrors];

  return {
    success: result.success && extraErrors.length === 0,
    errors,
    stats: result.stats,
    ...(result.filename === undefined ? {} : { filename: result.filename }),
  };
}
