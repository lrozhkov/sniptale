import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ExportProgress } from '@sniptale/runtime-contracts/export';
import type { PopupExportState } from '../types';
import type { PopupExportStartEmitMessage } from './emit';

type PopupExportProgressEmitterProps = {
  emitMessage: PopupExportStartEmitMessage;
  requestId: string;
  state: PopupExportState;
};

type PopupExportProgressListener = {
  onProgress: (callback: (progress: ExportProgress) => void) => void;
};

type PopupExportStartProgressProps = PopupExportProgressEmitterProps & {
  exportRunner: PopupExportProgressListener;
};

export function createPopupExportProgressEmitter({
  emitMessage,
  requestId,
  state,
}: PopupExportProgressEmitterProps): (progress: ExportProgress) => void {
  return (progress: ExportProgress): void => {
    if (state.activeExportRequestId !== requestId) {
      return;
    }

    void emitMessage({
      type: MessageType.EXPORT_POPUP_PROGRESS,
      requestId,
      progress,
    });
  };
}

export function attachPopupExportStartProgress({
  emitMessage,
  exportRunner,
  requestId,
  state,
}: PopupExportStartProgressProps): void {
  exportRunner.onProgress(
    createPopupExportProgressEmitter({
      emitMessage,
      requestId,
      state,
    })
  );
}
