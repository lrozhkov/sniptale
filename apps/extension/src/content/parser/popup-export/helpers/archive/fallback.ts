import { translate } from '../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { ExportResult } from '@sniptale/runtime-contracts/export';

const logger = createLogger({ namespace: 'ContentPopupExport' });

type PersistablePopupExportArchive = ExportResult & {
  blob: Blob;
  filename: string;
};

function assertPersistablePopupExportArchive(
  result: ExportResult
): asserts result is PersistablePopupExportArchive {
  if (!result.blob || !result.filename) {
    throw new Error('Popup export archive is missing blob or filename.');
  }
}

export async function fallbackToDirectDownload(
  result: ExportResult,
  cause?: unknown
): Promise<string[]> {
  assertPersistablePopupExportArchive(result);
  if (cause !== undefined) {
    logger.warn('Background save failed, using direct download', {
      error: cause,
      filename: result.filename,
    });
  }

  try {
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    link.click();
    URL.revokeObjectURL(url);
    return [];
  } catch (fallbackError) {
    const message =
      fallbackError instanceof Error
        ? fallbackError.message
        : translate('content.runtime.saveArchiveFailed');
    return [message];
  }
}
