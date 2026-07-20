import type { PopupExportRuntimeDeps, PopupExportRuntimeContract } from '../types';
import { createSnapshotResult, requestSaveWebSnapshot } from './request';
import { getWebSnapshotUnavailableError, setWebSnapshotError } from './state';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../../../platform/i18n';

function getSelectedSnapshotTabIds(state: PopupExportRuntimeContract): number[] {
  return state.selectedTabIdsInOrder.length > 0
    ? state.selectedTabIdsInOrder
    : state.selectedTabIds;
}

function getSnapshotTabTitle(state: PopupExportRuntimeContract, tabId: number): string {
  return state.availableTabs.find((tab) => tab.tabId === tabId)?.title ?? `Tab ${tabId}`;
}

function setSnapshotBatchProgress(
  state: PopupExportRuntimeContract,
  current: number,
  total: number,
  phase: 'scanning' | 'done' | 'error',
  message: string,
  errors: string[] = []
) {
  state.setProgress({
    activeStepKey: null,
    current,
    errors,
    message,
    phase,
    total,
  });
}

async function requestWebSnapshotBatchItem(args: {
  requestId: string;
  sendSaveWebSnapshotMessage: NonNullable<PopupExportRuntimeDeps['sendSaveWebSnapshotMessage']>;
  tabId: number;
}) {
  return args
    .sendSaveWebSnapshotMessage(args.tabId, {
      requestId: args.requestId,
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    })
    .catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
      success: false as const,
      warnings: [],
    }));
}

function appendSnapshotBatchItemResult(args: {
  response: Awaited<ReturnType<typeof requestWebSnapshotBatchItem>>;
  snapshotIds: string[];
  state: PopupExportRuntimeContract;
  tabId: number;
  warnings: string[];
}) {
  if (args.response.success && args.response.assetId) {
    args.snapshotIds.push(args.response.assetId);
    args.warnings.push(...(args.response.warnings ?? []));
    return;
  }

  if (args.response.success) {
    args.warnings.push(
      `${getSnapshotTabTitle(args.state, args.tabId)}: ${translate(
        'popup.export.webSnapshotMissingAssetId'
      )}`
    );
    return;
  }

  args.warnings.push(
    `${getSnapshotTabTitle(args.state, args.tabId)}: ${args.response.error ?? 'Snapshot failed'}`
  );
}

async function collectWebSnapshotBatch(args: {
  deps: PopupExportRuntimeDeps;
  requestId: string;
  state: PopupExportRuntimeContract;
  tabIds: number[];
}): Promise<{ snapshotIds: string[]; warnings: string[] } | null> {
  const sendSaveWebSnapshotMessage = args.deps.sendSaveWebSnapshotMessage;
  if (!sendSaveWebSnapshotMessage) {
    throw new Error(translate('popup.export.startExportError'));
  }

  const snapshotIds: string[] = [];
  const warnings: string[] = [];

  for (const [index, tabId] of args.tabIds.entries()) {
    if (args.state.requestIdRef.current !== args.requestId) {
      return null;
    }

    setSnapshotBatchProgress(
      args.state,
      index,
      args.tabIds.length,
      'scanning',
      `${translate('popup.export.webSnapshotSaving')} ${index + 1}/${args.tabIds.length}`
    );

    const response = await requestWebSnapshotBatchItem({
      requestId: args.requestId,
      sendSaveWebSnapshotMessage,
      tabId,
    });
    appendSnapshotBatchItemResult({ response, snapshotIds, state: args.state, tabId, warnings });
  }

  return { snapshotIds, warnings };
}

function applyWebSnapshotBatchResult(args: {
  snapshotIds: string[];
  state: PopupExportRuntimeContract;
  tabIds: number[];
  warnings: string[];
}) {
  const errors = args.snapshotIds.length > 0 ? [] : args.warnings;
  const success = args.snapshotIds.length > 0;

  args.state.requestIdRef.current = null;
  args.state.setResult(
    createSnapshotResult({
      errors,
      snapshotBatchSize: args.tabIds.length,
      snapshotIds: args.snapshotIds,
      success,
      warnings: args.warnings,
    })
  );
  setSnapshotBatchProgress(
    args.state,
    args.snapshotIds.length,
    args.tabIds.length,
    success ? 'done' : 'error',
    success
      ? translate('popup.export.webSnapshotsSaved')
      : translate('popup.export.startExportError'),
    errors
  );
}

function initializeWebSnapshotBatch(
  state: PopupExportRuntimeContract,
  requestId: string,
  tabIds: number[]
) {
  state.requestIdRef.current = requestId;
  state.setResult(null);
  setSnapshotBatchProgress(
    state,
    0,
    tabIds.length,
    'scanning',
    translate('popup.export.webSnapshotSaving')
  );
}

function saveWebSnapshotBatch(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps,
  tabIds: number[]
): Promise<void> {
  if (!deps.sendSaveWebSnapshotMessage) {
    throw new Error(translate('popup.export.startExportError'));
  }

  const requestId = deps.createRequestId();
  initializeWebSnapshotBatch(state, requestId, tabIds);
  return collectWebSnapshotBatch({ deps, requestId, state, tabIds }).then((collected) => {
    if (!collected || state.requestIdRef.current !== requestId) {
      return;
    }

    applyWebSnapshotBatchResult({ ...collected, state, tabIds });
  });
}

export async function saveWebSnapshotFromPopup(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps
): Promise<void> {
  if (state.exportDisabledReason || state.isExporting) {
    setWebSnapshotError(state, getWebSnapshotUnavailableError());
    return;
  }

  try {
    const selectedTabIds = getSelectedSnapshotTabIds(state);
    if (selectedTabIds.length > 1) {
      await saveWebSnapshotBatch(state, deps, selectedTabIds);
      return;
    }

    const [selectedTabId] = selectedTabIds;
    const tabId = selectedTabId ?? (await deps.getActiveTabId());
    if (typeof tabId !== 'number') {
      throw getWebSnapshotUnavailableError();
    }
    await requestSaveWebSnapshot(state, tabId, deps);
  } catch (error) {
    if (state.progress.phase !== 'error') {
      setWebSnapshotError(state, error);
    }
  }
}
