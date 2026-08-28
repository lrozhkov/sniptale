import { getDefaultPopupExportRuntimeDeps } from '../default-deps';
import type { PopupExportRuntimeDeps } from '../types';
import type { PopupExportRuntimeContract } from '../state';
import { reportStartExportFailure } from './failure';
import { getPopupExportSelection } from '../../session/selectors';
import { buildPopupExportOptions } from '../options';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  MAX_POPUP_EXPORT_JOB_TABS,
  normalizePopupExportTabTitle,
} from '@sniptale/runtime-contracts/export';
import { translate } from '../../../../../platform/i18n/popup';

export async function startPopupExport(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps = getDefaultPopupExportRuntimeDeps(),
  intent: 'export' | 'save' = 'export'
): Promise<void> {
  if (!state.hasLoadedPreferences) {
    return;
  }

  if (state.exportDisabledReason) {
    return;
  }

  if (intent === 'export' && !state.canExport) {
    return;
  }

  if (state.cancelRetryRef.current) {
    return;
  }

  try {
    const jobId = deps.createRequestId();
    const selectedIds = new Set(state.selectedTabIdsInOrder);
    const orderedTabs = state.selectedTabIdsInOrder
      .flatMap((tabId) => {
        const tab = state.availableTabs.find((candidate) => candidate.tabId === tabId);
        return tab && tab.disabledReason === null && selectedIds.has(tabId)
          ? [{ tabId, title: normalizePopupExportTabTitle(tab.title) }]
          : [];
      })
      .slice(0, MAX_POPUP_EXPORT_JOB_TABS);
    if (orderedTabs.length === 0) return;

    const plan =
      intent === 'save'
        ? {
            ...state.saveSelection,
            includeFullPageScreenshot: true,
            includePageDiagnostics: false,
            includeWebCopy: true,
          }
        : {
            ...getPopupExportSelection(state),
            includeWebCopy: state.includeWebCopy,
          };
    const options = buildPopupExportOptions(plan);
    const warnings: string[] = [];
    if (intent === 'export' && options.includeFullPageScreenshot) {
      const granted = await (deps.requestAllUrlsPermission?.() ?? Promise.resolve(true));
      if (!granted) {
        options.includeFullPageScreenshot = false;
        warnings.push(translate('popup.export.screenshotPermissionDeniedWarning'));
      }
    }

    state.requestIdRef.current = jobId;
    state.cancelRetryRef.current = {
      exportRunId: jobId,
      owner: 'job',
      tabIds: orderedTabs.map((tab) => tab.tabId),
    };
    const effectivePlan = {
      ...plan,
      includeFullPageScreenshot: options.includeFullPageScreenshot,
    };
    state.setResult(null);
    state.setLaunchedPlan(effectivePlan);
    state.setProgress({
      activeStepKey: effectivePlan.includeWebCopy ? 'webSnapshotDom' : null,
      current: 0,
      total: orderedTabs.length,
      errors: [],
      message: translate('popup.export.preparingPreview'),
      phase: 'scanning',
    });
    if (!deps.sendStartJobMessage) throw new Error('Popup export job transport is unavailable');
    const response = await deps.sendStartJobMessage({
      type: MessageType.START_PAGE_PACKAGE_JOB,
      includeWebCopy: effectivePlan.includeWebCopy,
      intent,
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
