import { createPopupExportRuntimeActions } from './actions';
import { usePopupExportCleanup } from './cleanup';
import { usePopupExportMessageListener } from './message-listener';
import type { PopupExportRuntimeContract } from './state';

export function usePopupExportRuntime(params: {
  isActive: boolean;
  state: PopupExportRuntimeContract;
}) {
  usePopupExportCleanup(params.state.copyResetTimeoutRef);
  usePopupExportMessageListener(params.state);

  return createPopupExportRuntimeActions(params.state);
}

export type PopupExportRuntimeActions = ReturnType<typeof createPopupExportRuntimeActions>;
