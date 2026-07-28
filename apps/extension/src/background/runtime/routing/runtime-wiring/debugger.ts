import { browserDebugger } from '@sniptale/platform/browser/debugger';
import {
  clearDebuggerSessionState,
  handleDebuggerEvent,
  handleDiagnosticsForcedDetach,
  handleExportHarDebuggerEvent,
  handleExportHarForcedDetach,
  getTabIdByTargetId,
} from '../../../diagnostics/lifecycle';
import { handleTabRecordingDebuggerDetach } from '../../../media/lifecycle';
import { getCaptureSurfaceService } from '../../../capture-surface';
import type { BackgroundModeState, RuntimeWiringLogger } from './shared';
import { ensureActivePageAccessRuntime } from '../../page-access/service';

export function registerDebuggerListeners(
  logger: RuntimeWiringLogger,
  state: Pick<BackgroundModeState, 'viewportOwnerState' | 'viewportState'>
): void {
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
    void getCaptureSurfaceService()
      .handleDebuggerDetach(tabId)
      .then((owners) => {
        handleTabRecordingDebuggerDetach(tabId, ensureActivePageAccessRuntime);
        if (!owners.includes('screenshot') && !owners.includes('quick-action')) return;
        state.viewportOwnerState.delete(tabId);
        state.viewportState.set(tabId, null);
      })
      .catch((error) => {
        logger.warn('Failed to reconcile capture surface after debugger detach', error);
        handleTabRecordingDebuggerDetach(tabId, ensureActivePageAccessRuntime);
      });
  });
}
