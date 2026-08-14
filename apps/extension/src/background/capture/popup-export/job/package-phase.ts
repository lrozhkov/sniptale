import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import { translate } from '../../../../platform/i18n';
import { isPopupExportPackageResponse } from '../../../../contracts/messaging/validators/export';
import { requestPopupExportPagePackage } from '../../../runtime/routing/boundary/popup-export-routing';
import type { PopupExportCollectedPackage } from './archive';
import {
  addPopupExportPackageResourceUsage,
  assertPopupExportAggregateResourceUsage,
  EMPTY_POPUP_EXPORT_PACKAGE_RESOURCE_USAGE,
  parsePopupExportPagePackageAtBoundary,
  type PopupExportPackageResourceUsage,
} from './package-boundary';
import {
  popupExportJobErrorText,
  updatePopupExportJobStatus,
  type ActivePopupExportJob,
} from './runtime-state';

export async function collectPopupExportPagePackages(
  job: ActivePopupExportJob,
  tabs: Map<number, chrome.tabs.Tab>
): Promise<{ errors: string[]; packages: PopupExportCollectedPackage[] }> {
  const errors: string[] = [];
  const packages: PopupExportCollectedPackage[] = [];
  let aggregateUsage: PopupExportPackageResourceUsage = {
    ...EMPTY_POPUP_EXPORT_PACKAGE_RESOURCE_USAGE,
  };
  const packageOptions: ExportOptions = {
    ...job.status.effectiveOptions,
    includeFullPageScreenshot: false,
  };

  for (const [index, selected] of job.status.orderedTabs.entries()) {
    if (job.cancelled) break;
    if (!tabs.has(selected.tabId)) continue;
    await updatePopupExportJobStatus(job, {
      progress: {
        current: index,
        total: job.status.orderedTabs.length,
        errors: [...errors],
        message: `${translate('popup.export.batchCollectingMessage')} ${selected.title}`,
        phase: 'downloading',
      },
    });
    try {
      const response = await requestPopupExportPagePackage({
        batchRequestId: job.status.jobId,
        options: packageOptions,
        tabId: selected.tabId,
      });
      if (!isPopupExportPackageResponse(response) || !response.success || !response.pagePackage) {
        throw new Error(
          isPopupExportPackageResponse(response)
            ? response.error || 'Page package failed'
            : 'Invalid page package response'
        );
      }
      const parsed = parsePopupExportPagePackageAtBoundary(response.pagePackage);
      const nextAggregateUsage = addPopupExportPackageResourceUsage(aggregateUsage, parsed.usage);
      assertPopupExportAggregateResourceUsage(nextAggregateUsage);
      aggregateUsage = nextAggregateUsage;
      packages.push({ pagePackage: parsed.pagePackage, tab: selected });
      errors.push(...parsed.pagePackage.errors.map((entry) => `${selected.title}: ${entry}`));
    } catch (error) {
      errors.push(`${selected.title}: ${popupExportJobErrorText(error)}`);
    }
  }
  return { errors, packages };
}
