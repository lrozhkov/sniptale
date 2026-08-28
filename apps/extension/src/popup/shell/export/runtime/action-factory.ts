import { getDefaultPopupExportRuntimeDeps } from './default-deps';
import type { PopupExportRuntimeDeps } from './types';
import type { PopupExportRuntimeContract } from './state';
import { cancelPopupExport } from './cancel';
import { copyPopupExportPreview } from './copy';
import { startPopupExport } from './start/execute';
import { resetPopupExportView } from './reset';

export function createPopupExportRuntimeActions(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps = getDefaultPopupExportRuntimeDeps()
) {
  return {
    handleCopyJson: () => copyPopupExportPreview(state, 'json', deps),
    handleCopyMarkdown: () => copyPopupExportPreview(state, 'markdown', deps),
    handleStartExport: () => startPopupExport(state, deps),
    handleSaveWebSnapshot: () => startPopupExport(state, deps, 'save'),
    handleCancelExport: () => cancelPopupExport(state, deps),
    handleResetExportView: () => resetPopupExportView(state, deps),
  };
}
