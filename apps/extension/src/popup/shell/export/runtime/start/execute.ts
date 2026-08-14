import { getDefaultPopupExportRuntimeDeps } from '../default-deps';
import type { PopupExportRuntimeDeps } from '../types';
import type { PopupExportRuntimeContract } from '../state';
import { reportStartExportFailure } from './failure';
import { getPopupExportSelection } from '../../session/selectors';
import { buildPopupExportOptions } from '../options';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../../../platform/i18n';

export async function startPopupExport(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps = getDefaultPopupExportRuntimeDeps()
): Promise<void> {
  if (state.exportDisabledReason) {
    return;
  }

  if (!state.canExport) {
    return;
  }

  if (state.cancelRetryRef.current) {
    return;
  }

  try {
    const jobId = deps.createRequestId();
    const selectedIds = new Set(state.selectedTabIdsInOrder);
    const orderedTabs = state.selectedTabIdsInOrder.flatMap((tabId) => {
      const tab = state.availableTabs.find((candidate) => candidate.tabId === tabId);
      return tab && tab.disabledReason === null && selectedIds.has(tabId)
        ? [{ tabId, title: tab.title }]
        : [];
    });
    if (orderedTabs.length === 0) return;

    const options = buildPopupExportOptions(getPopupExportSelection(state));
    const warnings: string[] = [];
    if (options.includeFullPageScreenshot) {
      const granted = await (deps.requestAllUrlsPermission?.() ?? Promise.resolve(true));
      if (!granted) {
        options.includeFullPageScreenshot = false;
        warnings.push(translate('popup.export.screenshotPermissionDeniedWarning'));
      }
    }

    state.requestIdRef.current = jobId;
    state.cancelRetryRef.current = {
      exportRunId: jobId,
      tabIds: orderedTabs.map((tab) => tab.tabId),
    };
    state.setResult(null);
    state.setProgress({
      activeStepKey: null,
      current: 0,
      total: orderedTabs.length,
      errors: [],
      message: translate('popup.export.preparingPreview'),
      phase: 'scanning',
    });
    if (!deps.sendStartJobMessage) throw new Error('Popup export job transport is unavailable');
    const response = await deps.sendStartJobMessage({
      type: MessageType.START_POPUP_EXPORT_JOB,
      jobId,
      orderedTabs,
      options,
      warnings,
    });
    if (!response?.success || !response.status) {
      throw new Error(response?.error || translate('popup.export.startExportError'));
    }
    state.setProgress(response.status.progress);
    if (response.status.result) state.setResult(response.status.result);
  } catch (error) {
    reportStartExportFailure(state, error);
  }
}
