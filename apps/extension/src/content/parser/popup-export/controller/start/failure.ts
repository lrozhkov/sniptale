import { translate } from '../../../../../platform/i18n';
import type { PopupExportResult } from '@sniptale/runtime-contracts/export';

export function createPopupExportFailureResult(error: unknown): PopupExportResult {
  return {
    success: false,
    errors: [error instanceof Error ? error.message : translate('content.runtime.exportFailed')],
    stats: {
      sectionsCount: 0,
      rowsCount: 0,
      filesCount: 0,
      filesFailed: 0,
    },
  };
}
