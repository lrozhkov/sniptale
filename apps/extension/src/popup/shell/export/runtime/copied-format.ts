import type { PopupExportRuntimeContract } from './state';
import type { PopupExportRuntimeDeps } from './types';

export function scheduleCopiedFormatReset(
  state: PopupExportRuntimeContract,
  format: 'json' | 'markdown',
  deps: PopupExportRuntimeDeps
) {
  if (state.copyResetTimeoutRef.current !== null) {
    deps.clearTimeout(state.copyResetTimeoutRef.current);
  }

  state.setCopiedFormat(format);
  state.copyResetTimeoutRef.current = deps.scheduleTimeout(() => {
    state.setCopiedFormat(null);
    state.copyResetTimeoutRef.current = null;
  }, 1600);
}
