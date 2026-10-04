import { getDefaultPopupExportRuntimeDeps } from '../default-deps';
import type { PopupExportRuntimeDeps } from '../types';
import type { PopupExportRuntimeContract } from '../state';
import { PopupExportPublicStartError, reportStartExportFailure } from './failure';
import { getPopupExportSelection } from '../../session/selectors';
import type { PopupPagePackageSelection } from '../../../../../composition/persistence/popup-export-preferences';
import { buildPopupExportOptions } from '../options';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  DEFAULT_EXPORT_RESOURCE_LIMITS,
  MAX_POPUP_EXPORT_JOB_TABS,
  normalizePopupExportTabTitle,
} from '@sniptale/runtime-contracts/export';
import { getCurrentLocale, translate } from '../../../../../platform/i18n/popup';
import { DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING } from '@sniptale/runtime-contracts/page-package';

export type PopupExportStartContext = {
  sourceDocumentId: string;
};

function isValidStartSourceSelection(
  state: PopupExportRuntimeContract,
  sources: readonly { kind: 'url' | 'tab' }[],
  startContext?: PopupExportStartContext
): boolean {
  return (
    !startContext ||
    (state.activeSourceMode === 'tabs' && sources.length === 1 && sources[0]?.kind === 'tab')
  );
}

function getStartPlan(
  state: PopupExportRuntimeContract,
  intent: 'export' | 'save',
  downloadFormat?: 'html'
): PopupPagePackageSelection {
  if (downloadFormat === 'html') {
    return {
      includeWebCopy: true,
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: true,
      includeViewportScreenshot: false,
      includePageDiagnostics: false,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
    };
  }
  if (intent === 'save') {
    return { ...state.saveSelection, includeFullPageScreenshot: true, includeWebCopy: true };
  }
  return { ...getPopupExportSelection(state), includeWebCopy: state.includeWebCopy };
}

export async function startPopupExport(
  state: PopupExportRuntimeContract,
  deps: PopupExportRuntimeDeps = getDefaultPopupExportRuntimeDeps(),
  intent: 'export' | 'save' = 'export',
  downloadFormat?: 'html',
  startContext?: PopupExportStartContext
): Promise<void> {
  if (!state.hasLoadedPreferences) {
    return;
  }

  if (state.exportDisabledReason) {
    return;
  }

  if (intent === 'export' && downloadFormat !== 'html' && !state.canExport) {
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
    if (sources.length === 0 || !isValidStartSourceSelection(state, sources, startContext)) return;

    const plan = getStartPlan(state, intent, downloadFormat);
    const resourceLimits = deps.loadExportResourceLimits
      ? await deps.loadExportResourceLimits()
      : { ...DEFAULT_EXPORT_RESOURCE_LIMITS };
    const options = { ...buildPopupExportOptions(plan), resourceLimits };
    const warnings: string[] = [];
    if (
      !startContext &&
      (state.activeSourceMode === 'urls' ||
        (intent === 'export' &&
          (options.includeFullPageScreenshot || options.includeViewportScreenshot === true)))
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
    state.setLaunchedPlan(
      downloadFormat === 'html'
        ? { ...effectivePlan, includeFullPageScreenshot: false }
        : effectivePlan
    );
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
      ...(downloadFormat ? { downloadFormat } : {}),
      ...(startContext ? { sourceDocumentId: startContext.sourceDocumentId } : {}),
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
