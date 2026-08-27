import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PopupExportRuntimeMessage, PopupExportRuntimeContract } from '../types';
import { translate } from '../../../../../platform/i18n/popup';

function getWebSnapshotProgressMessage(
  key: Extract<
    PopupExportRuntimeMessage,
    { type: 'WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED' }
  >['activeStepKey']
): string {
  switch (key) {
    case 'webSnapshotDom':
      return translate('popup.export.webSnapshotDomStep');
    case 'webSnapshotPreview':
      return translate('popup.export.webSnapshotPreviewStep');
    case 'webSnapshotStyles':
      return translate('popup.export.webSnapshotStylesStep');
    case 'webSnapshotAssets':
      return translate('popup.export.webSnapshotAssetsStep');
  }
}

type PopupExportMessageListenerApplyArgs = {
  message: PopupExportRuntimeMessage;
  requestId: string | null;
  setProgress: PopupExportRuntimeContract['setProgress'];
  setResult: PopupExportRuntimeContract['setResult'];
  clearRequestId: () => void;
  setRequestId?: (requestId: string) => void;
  latestStatus: { jobId: string; revision: number } | null;
  setLatestStatus: (status: { jobId: string; revision: number }) => void;
};

export function applyPopupExportRuntimeMessage(args: PopupExportMessageListenerApplyArgs): boolean {
  if (args.message.type === MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED) {
    if (args.requestId === null || args.message.requestId !== args.requestId) return false;
    args.setProgress({
      activeStepKey: args.message.activeStepKey,
      current: args.message.current,
      errors: [],
      message: getWebSnapshotProgressMessage(args.message.activeStepKey),
      phase: 'scanning',
      total: args.message.total,
    });
    return true;
  }

  if (args.message.type === MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED) {
    const { status } = args.message;
    if (args.requestId !== null && status.jobId !== args.requestId) return false;
    if (
      args.latestStatus?.jobId === status.jobId &&
      status.revision <= args.latestStatus.revision
    ) {
      return false;
    }
    args.setLatestStatus({ jobId: status.jobId, revision: status.revision });
    args.setRequestId?.(status.jobId);
    args.setProgress({
      ...status.progress,
      errors: [...new Set([...status.progress.errors, ...status.warnings])],
    });
    if (status.result) args.setResult(status.result);
    if (
      status.phase === 'cancelled' ||
      status.phase === 'completed' ||
      status.phase === 'failed' ||
      status.phase === 'interrupted'
    ) {
      args.clearRequestId();
    }
    return true;
  }

  return false;
}
