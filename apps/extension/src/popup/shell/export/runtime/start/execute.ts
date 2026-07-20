import { getDefaultPopupExportRuntimeDeps } from '../default-deps';
import type { PopupExportRuntimeDeps } from '../types';
import type { PopupExportRuntimeContract } from '../state';
import { reportStartExportFailure } from './failure';
import { startPopupExportBatch } from './batch';
import { requestStartExport } from './request';

export async function startPopupExport(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps = getDefaultPopupExportRuntimeDeps()
): Promise<void> {
  if (state.exportDisabledReason) {
    return;
  }

  if (!state.canExport) {
    return;
  }

  try {
    if (state.selectedTabIdsInOrder.length > 1) {
      await startPopupExportBatch(state, deps, state.selectedTabIdsInOrder);
      return;
    }

    const [selectedTabId] = state.selectedTabIdsInOrder;
    if (typeof selectedTabId !== 'number') {
      return;
    }

    await requestStartExport(state, selectedTabId, deps);
  } catch (error) {
    reportStartExportFailure(state, error);
  }
}
