import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../../../platform/i18n';
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
  state: PopupExportRuntimeContract,
  tabId: number,
  deps: PopupExportRuntimeDeps,
  requestId: string
) {
  if (!deps.sendSaveWebSnapshotMessage) {
    throw new Error(translate('popup.export.startExportError'));
  }

  return deps
    .sendSaveWebSnapshotMessage(tabId, {
      requestId,
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    })
    .catch((error: unknown) => {
      setWebSnapshotError(state, error);
      throw error;
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

  const response = await sendSaveWebSnapshotRequest(state, tabId, deps, requestId);

  if (!response?.success) {
    const error = new Error(
      getPopupExportTransportErrorMessage(response?.error, 'popup.export.startExportError')
    );
    setWebSnapshotError(state, error);
    throw error;
  }

  if (state.requestIdRef.current !== requestId) {
    return { snapshotIds: [], warnings: [] };
  }

  const result = readSnapshotResponseAsset(response);

  applySaveWebSnapshotResult(state, result);
  return result;
}

export { createSnapshotResult };
