import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PopupExportRuntimeMessage, PopupExportRuntimeContract } from '../types';

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
