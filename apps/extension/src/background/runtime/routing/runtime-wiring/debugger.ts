import { browserDebugger } from '@sniptale/platform/browser/debugger';
import {
  clearDebuggerSessionState,
  handleDebuggerEvent,
  handleDiagnosticsForcedDetach,
  handleExportHarDebuggerEvent,
  handleExportHarForcedDetach,
  getTabIdByTargetId,
} from '../../../diagnostics/lifecycle';
import { handleViewportRecordingDebuggerDetach } from '../../../media/lifecycle';
import type { RuntimeWiringLogger } from './shared';

export function registerDebuggerListeners(logger: RuntimeWiringLogger): void {
  browserDebugger.subscribeToEvent((source, method, params) => {
    handleDebuggerEvent(source, method, params);
    handleExportHarDebuggerEvent(source, method, params);
  });

  browserDebugger.subscribeToDetach((source, reason) => {
    const tabId =
      source.tabId ?? (source.targetId ? getTabIdByTargetId(source.targetId) : undefined);
    logger.log('Debugger detached', { tabId, targetId: source.targetId, reason });

    if (tabId === undefined) {
      return;
    }

    clearDebuggerSessionState(tabId);
    handleDiagnosticsForcedDetach(tabId);
    handleExportHarForcedDetach(tabId);
    handleViewportRecordingDebuggerDetach(tabId);
  });
}
