import { translate } from '../../../../../platform/i18n';
import { getPopupExportSelection } from '../../session/selectors';
import type { PopupExportRuntimeContract } from '../state';
import {
  logPopupExportBatchEmptyResult,
  logPopupExportBatchStale,
  logPopupExportBatchStart,
} from '../logging';
import type { PopupExportRuntimeDeps } from '../types';
import { collectBatchPagePackages } from './batch-requests';
import { resolvePopupBatchArchiveLayout } from './batch-layout';
import { finishBatchExport } from './batch-save';
import {
  finishEmptyBatchExport,
  getSelectedBatchTabs,
  isCurrentBatchRequest,
  setBatchExportProgress,
} from './batch-state';

function initializeBatchExport(
  state: PopupExportRuntimeContract,
  requestId: string,
  selectedTabIds: number[]
) {
  logPopupExportBatchStart({
    requestId,
    selectedCount: selectedTabIds.length,
  });
  state.requestIdRef.current = requestId;
  state.cancelRetryRef.current = { exportRunId: requestId, tabIds: [...selectedTabIds] };
  state.setResult(null);
  setBatchExportProgress(
    state,
    0,
    selectedTabIds.length,
    translate('popup.export.batchPrepareMessage'),
    'scanning'
  );
}

export async function startPopupExportBatch(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps,
  selectedTabIds: number[]
): Promise<void> {
  const requestId = deps.createRequestId();
  const selectedTabs = getSelectedBatchTabs(state, selectedTabIds);
  const layout = resolvePopupBatchArchiveLayout({
    pageCount: selectedTabs.length,
    selection: getPopupExportSelection(state),
  });

  initializeBatchExport(
    state,
    requestId,
    selectedTabs.flatMap((tab) => (typeof tab.tabId === 'number' ? [tab.tabId] : []))
  );

  const collectedBatch = await collectBatchPagePackages({
    deps,
    requestId,
    selectedTabs,
    state,
  });

  if (!collectedBatch || !isCurrentBatchRequest(state, requestId)) {
    logPopupExportBatchStale({
      phase: 'collect',
      requestId,
    });
    return;
  }

  if (collectedBatch.pagePackages.length === 0) {
    finishEmptyBatchExport({
      errors: collectedBatch.errors,
      onEmptyResult: logPopupExportBatchEmptyResult,
      requestId,
      selectedCount: selectedTabs.length,
      state,
      total: selectedTabs.length,
    });
    return;
  }

  await finishBatchExport({
    deps,
    errors: collectedBatch.errors,
    layout,
    pagePackages: collectedBatch.pagePackages,
    requestId,
    state,
  });
}
