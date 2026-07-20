import { getDefaultPopupExportRuntimeDeps } from './default-deps';
import type { PopupExportRuntimeDeps } from './types';
import type { PopupExportRuntimeContract } from './state';
import { cancelPopupExport } from './cancel';
import { copyPopupExportPreview } from './copy';
import { startPopupExport } from './start/execute';
import { saveWebSnapshotFromPopup } from './snapshot';

export function createPopupExportRuntimeActions(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps = getDefaultPopupExportRuntimeDeps()
) {
  return {
    handleCopyJson: () => copyPopupExportPreview(state, 'json', deps),
    handleCopyMarkdown: () => copyPopupExportPreview(state, 'markdown', deps),
    handleStartExport: () => startPopupExport(state, deps),
    handleSaveWebSnapshot: () => saveWebSnapshotFromPopup(state, deps),
    handleCancelExport: () => cancelPopupExport(state, deps),
  };
}
