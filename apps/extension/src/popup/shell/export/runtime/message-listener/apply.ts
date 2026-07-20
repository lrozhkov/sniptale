import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { updatePopupExportProgressFromResult } from '../progress';
import type { PopupExportRuntimeMessage, PopupExportRuntimeContract } from '../types';

type PopupExportMessageListenerApplyArgs = {
  message: PopupExportRuntimeMessage;
  requestId: string | null;
  setProgress: PopupExportRuntimeContract['setProgress'];
  setResult: PopupExportRuntimeContract['setResult'];
  clearRequestId: () => void;
};

export function applyPopupExportRuntimeMessage(args: PopupExportMessageListenerApplyArgs): boolean {
  if (!args.message.requestId || args.message.requestId !== args.requestId) {
    return false;
  }

  if (args.message.type === MessageType.EXPORT_POPUP_PROGRESS && args.message.progress) {
    args.setProgress(args.message.progress);
    return true;
  }

  if (args.message.type === MessageType.EXPORT_POPUP_RESULT && args.message.result) {
    args.setResult(args.message.result);
    updatePopupExportProgressFromResult(args.setProgress, args.message.result);
    args.clearRequestId();
    return true;
  }

  return false;
}
