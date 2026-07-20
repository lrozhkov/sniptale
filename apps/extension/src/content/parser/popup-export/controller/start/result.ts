import type { ExportResult, PopupExportResult } from '@sniptale/runtime-contracts/export';

export function createPopupExportResult(
  result: ExportResult,
  persistErrors: string[]
): PopupExportResult {
  const errors = [...result.errors, ...persistErrors];

  return {
    success: result.success && errors.length === 0,
    errors,
    stats: result.stats,
    ...(result.filename === undefined ? {} : { filename: result.filename }),
  };
}
