import { attachPopupExportStartProgress } from './progress';
import { emitPopupExportStartResult, type PopupExportStartEmitMessage } from './emit';
import { settlePopupExportStartFlow, type PopupExportStartSettlementProps } from './settle';

export type PopupExportStartFlowProps = PopupExportStartSettlementProps & {
  emitMessage: PopupExportStartEmitMessage;
};

export async function runPopupExportStartFlow(props: PopupExportStartFlowProps): Promise<void> {
  attachPopupExportStartProgress({
    emitMessage: props.emitMessage,
    exportRunner: props.exportRunner,
    requestId: props.requestId,
    state: props.state,
  });

  const popupResult = await settlePopupExportStartFlow(props);
  await emitPopupExportStartResult({
    emitMessage: props.emitMessage,
    requestId: props.requestId,
    result: popupResult,
  });
}
