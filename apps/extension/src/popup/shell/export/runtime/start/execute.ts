import { getDefaultPopupExportRuntimeDeps } from '../default-deps';
import type { PopupExportRuntimeDeps } from '../types';
import type { PopupExportRuntimeContract } from '../state';
import { PopupExportPublicStartError, reportStartExportFailure } from './failure';
import { getPopupExportSelection } from '../../session/selectors';
import { buildPopupExportOptions } from '../options';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  DEFAULT_EXPORT_RESOURCE_LIMITS,
  MAX_POPUP_EXPORT_JOB_TABS,
  normalizePopupExportTabTitle,
} from '@sniptale/runtime-contracts/export';
import { getCurrentLocale, translate } from '../../../../../platform/i18n/popup';
import { DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING } from '@sniptale/runtime-contracts/page-package';

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

  const locale = getCurrentLocale();
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
    const sources =
      state.activeSourceMode === 'urls'
        ? state.selectedUrls.map((url) => ({ kind: 'url' as const, url }))
        : orderedTabs.map((tab) => ({ kind: 'tab' as const, ...tab }));
    if (sources.length === 0) return;

    const plan =
      intent === 'save'
        ? {
            ...state.saveSelection,
            includeFullPageScreenshot: true,
            includeWebCopy: true,
          }
        : {
            ...getPopupExportSelection(state),
            includeWebCopy: state.includeWebCopy,
          };
    const resourceLimits = deps.loadExportResourceLimits
      ? await deps.loadExportResourceLimits()
      : { ...DEFAULT_EXPORT_RESOURCE_LIMITS };
    const options = { ...buildPopupExportOptions(plan), resourceLimits };
    const warnings: string[] = [];
    if (
      state.activeSourceMode === 'urls' ||
      (intent === 'export' &&
        (options.includeFullPageScreenshot || options.includeViewportScreenshot === true))
    ) {
      const granted = await (deps.requestAllUrlsPermission?.() ?? Promise.resolve(true));
      if (!granted) {
        if (state.activeSourceMode === 'urls')
          throw new PopupExportPublicStartError(
            translate('popup.export.urlPermissionDenied', locale)
          );
        else {
          options.includeFullPageScreenshot = false;
          options.includeViewportScreenshot = false;
          warnings.push(translate('popup.export.screenshotPermissionDeniedWarning', locale));
        }
      }
    }
    const captureTiming = deps.loadPageCaptureTiming
      ? await deps.loadPageCaptureTiming()
      : { ...DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING };

    state.requestIdRef.current = jobId;
    state.terminalRequestIdRef.current = null;
    state.cancelRetryRef.current = {
      exportRunId: jobId,
      locale,
      owner: 'job',
      tabIds: state.activeSourceMode === 'urls' ? [] : orderedTabs.map((tab) => tab.tabId),
    };
    const effectivePlan = {
      ...plan,
      includeFullPageScreenshot: options.includeFullPageScreenshot,
      includeViewportScreenshot: options.includeViewportScreenshot === true,
    };
    state.setResult(null);
    state.setLaunchedPlan(effectivePlan);
    state.setProgress({
      activeStepKey: effectivePlan.includeWebCopy ? 'webSnapshotDom' : null,
      current: 0,
      total: sources.length,
      errors: [],
      message: translate('popup.export.preparingPreview', locale),
      phase: 'scanning',
    });
    if (!deps.sendStartJobMessage) throw new Error('Popup export job transport is unavailable');
    const response = await deps.sendStartJobMessage({
      type: MessageType.START_PAGE_PACKAGE_JOB,
      includeWebCopy: effectivePlan.includeWebCopy,
      intent,
      jobId,
      locale,
      captureTiming,
      sources,
      options,
      warnings,
    });
    if (!response?.success || !response.status) {
      throw new Error(response?.error || translate('popup.export.startExportError', locale));
    }
  } catch (error) {
    reportStartExportFailure(state, error, locale);
  }
}
