import { browserTabs } from '@sniptale/platform/browser/tabs';
import type {
  PagePackageCaptureSource,
  PagePackageJobTab,
} from '@sniptale/runtime-contracts/page-package';
import {
  clearTemporaryPagePackageTabs,
  readTemporaryPagePackageTabs,
  recordTemporaryPagePackageTab,
} from './temporary-tabs-storage';

type MaterializedPagePackageSources = {
  orderedTabs: PagePackageJobTab[];
  temporaryTabIds: number[];
};

export async function closeTemporaryPagePackageTabs(tabIds: readonly number[]): Promise<void> {
  if (tabIds.length === 0) return;
  const existing = await Promise.all(
    tabIds.map(async (tabId) => {
      try {
        await browserTabs.get(tabId);
        return tabId;
      } catch {
        return null;
      }
    })
  );
  const retained = existing.filter((tabId): tabId is number => tabId !== null);
  if (retained.length > 0) await browserTabs.remove(retained);
}

export async function cleanupTemporaryPagePackageTabs(
  jobId: string,
  tabIds: readonly number[]
): Promise<void> {
  await closeTemporaryPagePackageTabs(tabIds);
  await clearTemporaryPagePackageTabs(jobId);
}

export async function reconcileTemporaryPagePackageTabs(): Promise<void> {
  const retained = await readTemporaryPagePackageTabs();
  if (retained) await cleanupTemporaryPagePackageTabs(retained.jobId, retained.tabIds);
}

export async function materializePagePackageCaptureSources(
  jobId: string,
  sources: readonly PagePackageCaptureSource[]
): Promise<MaterializedPagePackageSources> {
  if (sources[0]?.kind === 'tab') {
    return {
      orderedTabs: sources.map((source) => {
        if (source.kind !== 'tab') throw new Error('Page Package source modes cannot be mixed.');
        return { tabId: source.tabId, title: source.title };
      }),
      temporaryTabIds: [],
    };
  }
  const temporaryTabIds: number[] = [];
  const orderedTabs: PagePackageJobTab[] = [];
  try {
    for (const source of sources) {
      if (source.kind !== 'url') throw new Error('Page Package source modes cannot be mixed.');
      const tab = await browserTabs.create({ active: false, url: source.url });
      if (typeof tab.id !== 'number') throw new Error('Browser did not create a capture tab.');
      temporaryTabIds.push(tab.id);
      await recordTemporaryPagePackageTab(jobId, tab.id);
      orderedTabs.push({ tabId: tab.id, title: source.url });
    }
    return { orderedTabs, temporaryTabIds };
  } catch (error) {
    try {
      await cleanupTemporaryPagePackageTabs(jobId, temporaryTabIds);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Page Package temporary-tab cleanup failed after source materialization.',
        { cause: cleanupError }
      );
    }
    throw error;
  }
}
