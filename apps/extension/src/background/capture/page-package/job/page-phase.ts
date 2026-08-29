import {
  truncatePopupExportStatusText,
  type ExportOptions,
} from '@sniptale/runtime-contracts/export';
import type { PagePackageJobTab } from '@sniptale/runtime-contracts/page-package';
import { translate } from '../../../../platform/i18n';
import { isPopupExportPackageResponse } from '../../../../contracts/messaging/validators/export';
import type { StagedPagePackageDescriptor } from './page-boundary';
import {
  appendPopupExportJobWarning,
  popupExportJobErrorText,
  updatePagePackageJobStatus,
  type ActivePopupExportJob,
} from './runtime-state';
import { activatePopupExportCaptureTarget } from './visible';
import { createLogger } from '@sniptale/platform/observability/logger';
import { markActivePagePackageJobProducerFailure } from './active-job';
import type { ExportProgressStepKey } from '@sniptale/runtime-contracts/export';
import { waitForPagePackageCaptureReadiness } from './page-readiness';
import { DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING } from '@sniptale/runtime-contracts/page-package';

const logger = createLogger({ namespace: 'BackgroundPagePackageJob' });
const PAGE_PACKAGE_PREPARATION_CODE_PATTERN = /\[([A-Z][A-Z0-9_]{1,63})\]$/u;
const WEB_COPY_FAILURE_STEPS: Record<string, ExportProgressStepKey> = {
  WEB_COPY_WEBSNAPSHOTASSETS: 'webSnapshotAssets',
  WEB_COPY_WEBSNAPSHOTDOM: 'webSnapshotDom',
  WEB_COPY_WEBSNAPSHOTPREVIEW: 'webSnapshotPreview',
  WEB_COPY_WEBSNAPSHOTSTYLES: 'webSnapshotStyles',
  WEB_COPY_WEBSNAPSHOTWARNINGS: 'webSnapshotWarnings',
};

function resolveFailedProgressStep(
  error: unknown,
  activeStepKey: ExportProgressStepKey | null | undefined
): ExportProgressStepKey | null {
  const message = error instanceof Error ? error.message : String(error);
  const code = PAGE_PACKAGE_PREPARATION_CODE_PATTERN.exec(message)?.[1];
  if (!code) return null;
  if (code === 'SELECTED_DATA' && activeStepKey && !activeStepKey.startsWith('webSnapshot')) {
    return activeStepKey;
  }
  return WEB_COPY_FAILURE_STEPS[code] ?? null;
}

function getPublicPagePackagePreparationError(response: unknown): string {
  const fallback = translate('content.runtime.exportPrepareFailed');
  if (!isPopupExportPackageResponse(response) || response.success !== false || !response.error) {
    return fallback;
  }
  const code = PAGE_PACKAGE_PREPARATION_CODE_PATTERN.exec(response.error)?.[1];
  return code ? `${fallback} [${code}]` : fallback;
}

export interface CollectedStagedPagePackage {
  descriptor: StagedPagePackageDescriptor;
  tab: PagePackageJobTab;
}

export class PopupExportPagePackageFatalError extends Error {}

function waitForPagePackageResponse(
  request: Promise<unknown>,
  signal: AbortSignal
): Promise<unknown> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('Popup export cancelled'));
  let removeAbortListener = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    const cancel = () => reject(signal.reason ?? new Error('Popup export cancelled'));
    signal.addEventListener('abort', cancel, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', cancel);
  });
  void request.catch(() => undefined);
  return Promise.race([request, cancellation]).finally(removeAbortListener);
}

async function requestPopupExportPagePackage(
  job: ActivePopupExportJob,
  tab: chrome.tabs.Tab,
  selected: PagePackageJobTab,
  ordinal: number,
  options: ExportOptions
): Promise<StagedPagePackageDescriptor> {
  if (job.status.effectiveComponentPlan.includeScreenshot) {
    try {
      await activatePopupExportCaptureTarget(job, tab, selected);
    } catch {
      await appendPopupExportJobWarning(
        job,
        truncatePopupExportStatusText(
          `${selected.title}: ${translate('content.runtime.captureFullPageScreenshotFailed')}`
        )
      );
    }
  }
  const response = await waitForPagePackageResponse(
    job.contentPort.requestPagePackage({
      batchRequestId: job.status.jobId,
      includeWebCopy: job.status.effectiveComponentPlan.components.webCopy,
      intent: job.status.intent,
      ordinal,
      options,
      tabId: selected.tabId,
    }),
    job.abortController.signal
  );
  if (!isPopupExportPackageResponse(response) || !response.success || !response.stagedPagePackage) {
    throw new Error(getPublicPagePackagePreparationError(response));
  }
  const descriptor = response.stagedPagePackage;
  if (descriptor.jobId !== job.status.jobId || descriptor.ordinal !== ordinal) {
    throw new Error('Page Package response is bound to another job page.');
  }
  return descriptor;
}

async function recordPopupExportPageOutcome(
  job: ActivePopupExportJob,
  ordinal: number,
  outcome: { error?: string; status: 'failed' | 'succeeded'; tabId: number }
): Promise<void> {
  await updatePagePackageJobStatus(job, {
    pageOutcomes: job.status.pageOutcomes.map((current) =>
      current.ordinal === ordinal ? { ordinal, ...outcome } : current
    ),
  });
}

export async function collectPopupExportPagePackages(
  job: ActivePopupExportJob,
  tabs: Map<number, chrome.tabs.Tab>,
  onPackage?: (item: CollectedStagedPagePackage) => Promise<void>
): Promise<{ errors: string[]; packages: CollectedStagedPagePackage[] }> {
  const errors = job.status.pageOutcomes.flatMap((outcome) =>
    outcome.status === 'failed' && outcome.error ? [outcome.error] : []
  );
  const packages: CollectedStagedPagePackage[] = [];
  const packageOptions: ExportOptions = { ...job.status.effectiveOptions };

  for (const [index, selected] of job.status.orderedTabs.entries()) {
    if (job.cancelled) break;
    const tab = tabs.get(selected.tabId);
    if (!tab) continue;
    await updatePagePackageJobStatus(job, {
      progress: {
        current: index,
        total: job.status.orderedTabs.length,
        errors: [...errors],
        message: truncatePopupExportStatusText(
          `${translate('popup.export.batchCollectingMessage')} ${selected.title}`
        ),
        phase: 'downloading',
      },
    });
    try {
      await waitForPagePackageCaptureReadiness({
        signal: job.abortController.signal,
        tabId: selected.tabId,
        timing: job.captureTiming ?? DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING,
      });
      const descriptor = await requestPopupExportPagePackage(
        job,
        tab,
        selected,
        index,
        packageOptions
      );
      const item = { descriptor, tab: selected };
      if (job.cancelled) throw new Error('Popup export cancelled');
      if (onPackage) await onPackage(item);
      else packages.push(item);
      await recordPopupExportPageOutcome(job, index, {
        status: 'succeeded',
        tabId: selected.tabId,
      });
    } catch (error) {
      if (error instanceof PopupExportPagePackageFatalError) throw error;
      if (job.cancelled) break;
      logger.error('Page Package page collection failed', {
        error: popupExportJobErrorText(error),
        jobId: job.status.jobId,
        ordinal: index,
        tabId: selected.tabId,
      });
      const errorText = truncatePopupExportStatusText(
        `${selected.title}: ${popupExportJobErrorText(error)}`
      );
      await markActivePagePackageJobProducerFailure(
        job,
        resolveFailedProgressStep(error, job.status.progress.activeStepKey)
      );
      errors.push(errorText);
      await recordPopupExportPageOutcome(job, index, {
        error: errorText,
        status: 'failed',
        tabId: selected.tabId,
      });
    }
  }
  return { errors, packages };
}
