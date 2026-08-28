import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ExportProgress } from '@sniptale/runtime-contracts/export';

import type { PopupExportRuntimeContract, PopupExportRuntimeDeps } from './types';

const IDLE_EXPORT_PROGRESS: ExportProgress = {
  activeStepKey: null,
  current: 0,
  errors: [],
  message: '',
  phase: 'idle',
  total: 0,
};

export async function resetPopupExportView(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps
): Promise<void> {
  try {
    await deps.sendAckJobStatusMessage?.({
      type: MessageType.ACK_PAGE_PACKAGE_JOB_STATUS,
    });
  } finally {
    state.setProgress(IDLE_EXPORT_PROGRESS);
    state.setResult(null);
    state.setLaunchedPlan(null);
  }
}
