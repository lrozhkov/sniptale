import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ExportProgress, PopupExportResult } from '@sniptale/runtime-contracts/export';

export type PopupExportStartEmitMessage = (
  message:
    | {
        type: MessageType.EXPORT_POPUP_PROGRESS;
        progress: ExportProgress;
        requestId: string;
      }
    | {
        type: MessageType.EXPORT_POPUP_RESULT;
        requestId: string;
        result: PopupExportResult;
      }
) => Promise<void>;

type PopupExportStartEmitResultProps = {
  emitMessage: PopupExportStartEmitMessage;
  requestId: string;
  result: PopupExportResult | null;
};

export async function emitPopupExportStartResult({
  emitMessage,
  requestId,
  result,
}: PopupExportStartEmitResultProps): Promise<void> {
  if (!result) {
    return;
  }

  await emitMessage({
    type: MessageType.EXPORT_POPUP_RESULT,
    requestId,
    result,
  });
}
