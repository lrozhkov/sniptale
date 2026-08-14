import type { PopupExportJobTab } from '@sniptale/runtime-contracts/export';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWindows } from '@sniptale/platform/browser/windows';
import { browserWebNavigation } from '@sniptale/platform/browser/web-navigation';
import { translate } from '../../../../platform/i18n';
import {
  ensureActivePageAccessRuntime,
  ensureNativeVisibleCaptureAuthority,
} from '../../../runtime/page-access/service';
import { captureFullPageForArchive } from '../../index';
import type { PopupExportCollectedPackage } from './archive';
import {
  appendPopupExportJobWarning,
  popupExportJobErrorText,
  updatePopupExportJobStatus,
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
      await appendPopupExportJobWarning(
        job,
        `${selected.title}: ${translate(
          'popup.export.tabUnavailableWarningPrefix'
        )} (${popupExportJobErrorText(error)})`
      );
    }
  }

  const originalActiveTabs: Array<{ windowId: number; tabId: number }> = [];
  for (const windowId of job.affectedWindowIds) {
    const [tab] = await browserTabs.query({ active: true, windowId });
    if (typeof tab?.id === 'number') originalActiveTabs.push({ windowId, tabId: tab.id });
  }
  await updatePopupExportJobStatus(job, { originalActiveTabs });
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

async function activatePopupExportCaptureTarget(
  job: ActivePopupExportJob,
  tab: chrome.tabs.Tab,
  selected: PopupExportJobTab
): Promise<void> {
  if (typeof tab.windowId !== 'number') throw new Error('Target window is unavailable');
  if (job.cancelled || job.manualActivationConflict) throw new Error('Screenshot capture stopped');
  job.expectedActivation = { tabId: selected.tabId, windowId: tab.windowId };
  await browserWindows.update(tab.windowId, { focused: true });
  await browserTabs.update(selected.tabId, { active: true });
  const [active] = await browserTabs.query({ active: true, windowId: tab.windowId });
  if (active?.id !== selected.tabId) throw new Error('Target tab did not remain active');
  job.lastActivatedByWindow.set(tab.windowId, selected.tabId);
  if (!job.status.activatedTabIds.includes(selected.tabId)) {
    await updatePopupExportJobStatus(job, {
      activatedTabIds: [...job.status.activatedTabIds, selected.tabId],
    });
  }
}

async function resolveTopDocumentId(tabId: number): Promise<string> {
  const frames = await browserWebNavigation.getAllFrames({ tabId });
  const top = frames?.find((frame) => frame.frameId === 0);
  if (!top?.documentId) throw new Error('Page document binding is unavailable');
  return top.documentId;
}

function dataUrlBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Screenshot payload is invalid');
  return dataUrl.slice(comma + 1);
}

export async function capturePopupExportScreenshots(args: {
  job: ActivePopupExportJob;
  packages: PopupExportCollectedPackage[];
  tabs: Map<number, chrome.tabs.Tab>;
}): Promise<void> {
  if (!args.job.status.effectiveOptions.includeFullPageScreenshot) return;
  for (const [index, item] of args.packages.entries()) {
    if (args.job.cancelled || args.job.manualActivationConflict) break;
    const tab = args.tabs.get(item.tab.tabId);
    if (!tab) continue;
    await updatePopupExportJobStatus(args.job, {
      progress: {
        current: index,
        total: args.packages.length,
        errors: args.job.status.progress.errors,
        message: translate('content.runtime.captureFullPageScreenshot'),
        phase: 'scanning',
        activeStepKey: 'fullPageScreenshot',
      },
    });
    try {
      await activatePopupExportCaptureTarget(args.job, tab, item.tab);
      if (args.job.manualActivationConflict || args.job.cancelled) break;
      await ensureActivePageAccessRuntime(item.tab.tabId, 'Page access is required for export.');
      await ensureNativeVisibleCaptureAuthority(item.tab.tabId);
      const documentId = await resolveTopDocumentId(item.tab.tabId);
      const capture = await captureFullPageForArchive(item.tab.tabId, {
        abortSignal: args.job.abortController.signal,
        backendKind: 'native',
        documentId,
        exportRunId: args.job.status.jobId,
      });
      item.pagePackage.entries.push({
        path: 'page-screenshot.png',
        binaryBase64: dataUrlBase64(capture.dataUrl),
        mimeType: 'image/png',
      });
      for (const warning of capture.metadata.warnings) {
        await appendPopupExportJobWarning(args.job, warning);
      }
    } catch (error) {
      if (args.job.cancelled) break;
      await appendPopupExportJobWarning(
        args.job,
        `${item.tab.title}: ${translate(
          'content.runtime.captureFullPageScreenshotFailed'
        )} (${popupExportJobErrorText(error)})`
      );
    }
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
        `${translate('popup.export.restoreOriginalTabWarningPrefix')} (${popupExportJobErrorText(error)})`
      );
    }
  }
}
