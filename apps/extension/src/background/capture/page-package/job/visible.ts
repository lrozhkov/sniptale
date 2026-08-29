import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWindows } from '@sniptale/platform/browser/windows';
import { truncatePopupExportStatusText } from '@sniptale/runtime-contracts/export';
import type { PagePackageJobTab } from '@sniptale/runtime-contracts/page-package';
import { translate } from '../../../../platform/i18n';
import { restorePagePackageProgressPopup } from './action-indicator';
import {
  appendPopupExportJobWarning,
  popupExportJobErrorText,
  updatePagePackageJobStatus,
  type ActivePopupExportJob,
} from './runtime-state';

export async function resolvePopupExportTabsAndOriginals(
  job: ActivePopupExportJob
): Promise<Map<number, chrome.tabs.Tab>> {
  const tabs = new Map<number, chrome.tabs.Tab>();
  for (const selected of job.status.orderedTabs) {
    try {
      const tab = await browserTabs.get(selected.tabId);
      tabs.set(selected.tabId, tab);
      if (typeof tab.windowId === 'number') job.affectedWindowIds.add(tab.windowId);
    } catch (error) {
      const errorText = truncatePopupExportStatusText(
        `${selected.title}: ${translate(
          'popup.export.tabUnavailableWarningPrefix'
        )} (${popupExportJobErrorText(error)})`
      );
      await appendPopupExportJobWarning(job, errorText);
      await updatePagePackageJobStatus(job, {
        pageOutcomes: job.status.pageOutcomes.map((outcome) =>
          outcome.tabId === selected.tabId && outcome.status === 'pending'
            ? { ...outcome, error: errorText, status: 'failed' as const }
            : outcome
        ),
      });
    }
  }

  const originalActiveTabs: Array<{ windowId: number; tabId: number }> = [];
  for (const windowId of job.affectedWindowIds) {
    const [tab] = await browserTabs.query({ active: true, windowId });
    if (typeof tab?.id === 'number') originalActiveTabs.push({ windowId, tabId: tab.id });
  }
  await updatePagePackageJobStatus(job, { originalActiveTabs });
  return tabs;
}

export function subscribeToPopupExportManualActivation(job: ActivePopupExportJob): void {
  job.unsubscribeActivation = browserTabs.subscribeToActivated((info) => {
    if (!job.affectedWindowIds.has(info.windowId)) return;
    const expected = job.expectedActivation;
    if (expected?.tabId === info.tabId && expected.windowId === info.windowId) {
      job.expectedActivation = null;
      return;
    }
    job.manualActivationConflict = true;
    void appendPopupExportJobWarning(job, translate('popup.export.manualTabConflictWarning')).catch(
      () => undefined
    );
  });
}

export async function activatePopupExportCaptureTarget(
  job: ActivePopupExportJob,
  tab: chrome.tabs.Tab,
  selected: PagePackageJobTab
): Promise<void> {
  if (typeof tab.windowId !== 'number') throw new Error('Target window is unavailable');
  if (job.cancelled || job.manualActivationConflict) throw new Error('Screenshot capture stopped');
  const [currentActive] = await browserTabs.query({ active: true, windowId: tab.windowId });
  if (currentActive?.id === selected.tabId) return;
  job.expectedActivation = { tabId: selected.tabId, windowId: tab.windowId };
  await browserWindows.update(tab.windowId, { focused: true });
  await browserTabs.update(selected.tabId, { active: true });
  const [active] = await browserTabs.query({ active: true, windowId: tab.windowId });
  if (active?.id !== selected.tabId) throw new Error('Target tab did not remain active');
  job.lastActivatedByWindow.set(tab.windowId, selected.tabId);
  try {
    if (!job.status.activatedTabIds.includes(selected.tabId)) {
      await updatePagePackageJobStatus(job, {
        activatedTabIds: [...job.status.activatedTabIds, selected.tabId],
      });
    }
  } finally {
    await restorePagePackageProgressPopup(job, tab.windowId);
  }
}

export async function restorePopupExportOriginalTabs(job: ActivePopupExportJob): Promise<void> {
  for (const original of job.status.originalActiveTabs) {
    const lastActivated = job.lastActivatedByWindow.get(original.windowId);
    if (lastActivated === undefined) continue;
    try {
      const [active] = await browserTabs.query({ active: true, windowId: original.windowId });
      if (active?.id !== lastActivated) continue;
      job.expectedActivation = { tabId: original.tabId, windowId: original.windowId };
      await browserTabs.update(original.tabId, { active: true });
    } catch (error) {
      await appendPopupExportJobWarning(
        job,
        truncatePopupExportStatusText(
          `${translate('popup.export.restoreOriginalTabWarningPrefix')} (${popupExportJobErrorText(error)})`
        )
      );
    }
  }
}
