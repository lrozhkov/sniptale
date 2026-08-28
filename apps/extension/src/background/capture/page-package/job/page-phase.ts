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

export interface CollectedStagedPagePackage {
  descriptor: StagedPagePackageDescriptor;
  tab: PagePackageJobTab;
}

export class PopupExportPagePackageFatalError extends Error {}

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
  const response = await job.contentPort.requestPagePackage({
    batchRequestId: job.status.jobId,
    includeWebCopy: job.status.effectiveComponentPlan.components.webCopy,
    intent: job.status.intent,
    ordinal,
    options,
    tabId: selected.tabId,
  });
  if (!isPopupExportPackageResponse(response) || !response.success || !response.stagedPagePackage) {
    throw new Error(translate('content.runtime.exportPrepareFailed'));
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
      const errorText = truncatePopupExportStatusText(
        `${selected.title}: ${popupExportJobErrorText(error)}`
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
