import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ExportProgress } from '@sniptale/runtime-contracts/export';
import type { PopupExportRequestHandlerRuntime, PopupExportRunner } from '../types';

type PopupExportProgressEmitterProps = Pick<
  PopupExportRequestHandlerRuntime,
  'emitMessage' | 'state'
> & {
  requestId: string;
};

type PopupExportStartProgressProps = PopupExportProgressEmitterProps & {
  exportRunner: Pick<PopupExportRunner, 'onProgress'>;
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
