import type { PopupExportPreview } from '@sniptale/runtime-contracts/export';
import type { PopupExportRuntimeContract } from './state';

export function getPopupExportPreviewToCopy(
  _state: PopupExportRuntimeContract,
  preview: PopupExportPreview,
  format: 'json' | 'markdown'
): string {
  if (format === 'json') {
    return preview.jsonPreview;
  }

  return preview.markdownPreview;
}
