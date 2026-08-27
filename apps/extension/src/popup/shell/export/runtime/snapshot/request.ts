import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../../../platform/i18n/popup';
import { getPopupExportTransportErrorMessage } from '../preview-request';
import type { PopupExportRuntimeDeps, PopupExportRuntimeContract } from '../types';
import { setWebSnapshotError } from './state';

type SaveWebSnapshotResult = {
  snapshotIds: string[];
  warnings: string[];
};

function getSnapshotResultMessageKey(args: { hasWarnings: boolean; isBatch: boolean }) {
  if (args.isBatch && args.hasWarnings) {
    return 'popup.export.webSnapshotsSavedWithWarnings';
  }

  if (args.isBatch) {
    return 'popup.export.webSnapshotsSaved';
  }

  return args.hasWarnings
    ? 'popup.export.webSnapshotSavedWithWarnings'
    : 'popup.export.webSnapshotSaved';
}

function createSnapshotResult(args: {
  errors: string[];
  snapshotBatchSize?: number;
  snapshotIds: string[];
  success: boolean;
  warnings: string[];
}) {
  const hasWarnings = args.warnings.length > 0 || args.errors.length > 0;
  const snapshotBatchSize = args.snapshotBatchSize ?? args.snapshotIds.length;
  const isBatch = args.snapshotIds.length > 1;
  const result = {
    errors: args.errors,
    kind: 'webSnapshot' as const,
    stats: {
      filesCount: 4 + (hasWarnings ? 1 : 0),
      filesFailed: args.warnings.length,
      rowsCount: 0,
      sectionsCount: 4 + (hasWarnings ? 1 : 0),
    },
    snapshotBatchSize,
    snapshotIds: args.snapshotIds,
    success: args.success,
    warnings: args.warnings,
  };

  return args.success
    ? {
        ...result,
        filename: translate(getSnapshotResultMessageKey({ hasWarnings, isBatch })),
      }
    : result;
}

function readSnapshotResponseAsset(response: {
  assetId?: string | undefined;
  warnings?: string[] | undefined;
}): SaveWebSnapshotResult {
  if (!response.assetId) {
    throw new Error(translate('popup.export.webSnapshotMissingAssetId'));
  }

  return {
    snapshotIds: [response.assetId],
    warnings: response.warnings ?? [],
  };
}

export async function requestSaveWebSnapshot(
  state: PopupExportRuntimeContract,
  tabId: number,
  deps: PopupExportRuntimeDeps
): Promise<SaveWebSnapshotResult> {
  return runSaveWebSnapshotRequest(state, tabId, deps);
}

async function sendSaveWebSnapshotRequest(
  tabId: number,
  deps: PopupExportRuntimeDeps,
  requestId: string
) {
  if (!deps.sendSaveWebSnapshotMessage) {
    throw new Error(translate('popup.export.startExportError'));
  }

  return deps.sendSaveWebSnapshotMessage(tabId, {
    requestId,
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  });
}

function applySaveWebSnapshotResult(
  state: PopupExportRuntimeContract,
  result: SaveWebSnapshotResult
): void {
  state.setProgress({
    activeStepKey: null,
    current: 1,
    errors: [],
    message: translate('popup.export.webSnapshotSaved'),
    phase: 'done',
    total: 1,
  });
  state.setResult(
    createSnapshotResult({
      errors: [],
      snapshotBatchSize: 1,
      snapshotIds: result.snapshotIds,
      success: true,
      warnings: result.warnings,
    })
  );
}

async function runSaveWebSnapshotRequest(
  state: PopupExportRuntimeContract,
  tabId: number,
  deps: PopupExportRuntimeDeps
): Promise<SaveWebSnapshotResult> {
  const requestId = deps.createRequestId();
  state.requestIdRef.current = requestId;
  state.cancelRetryRef.current = { exportRunId: requestId, tabIds: [tabId] };
  state.setResult(null);
  state.setProgress({
    activeStepKey: 'webSnapshotDom',
    current: 0,
    errors: [],
    message: translate('popup.export.webSnapshotDomStep'),
    phase: 'scanning',
    total: 4,
  });

  try {
    const response = await sendSaveWebSnapshotRequest(tabId, deps, requestId);
    if (!response?.success) {
      throw new Error(
        getPopupExportTransportErrorMessage(response?.error, 'popup.export.startExportError')
      );
    }
    if (state.requestIdRef.current !== requestId) {
      return { snapshotIds: [], warnings: [] };
    }

    const result = readSnapshotResponseAsset(response);
    applySaveWebSnapshotResult(state, result);
    state.requestIdRef.current = null;
    state.cancelRetryRef.current = null;
    return result;
  } catch (error) {
    if (state.requestIdRef.current === requestId) {
      setWebSnapshotError(state, error);
      state.requestIdRef.current = null;
      state.cancelRetryRef.current = null;
    }
    throw error;
  }
}

export { createSnapshotResult };
