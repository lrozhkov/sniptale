import type { PopupExportState } from './types';

export function createPopupExportState(): PopupExportState {
  return {
    activeExportRequestId: null,
    isExportRunning: false,
  };
}

export function resetPopupExportState(state: PopupExportState): void {
  state.activeExportRequestId = null;
  state.isExportRunning = false;
}
