import type { PageAccessStatus } from '@sniptale/runtime-contracts/messaging/page-access';
import type { TemporaryTabActivationStore } from './tab-activation';
import {
  createPermissionScope,
  resolveStatusContext,
  type PageAccessStatusContext,
} from './target';
import { hasAllSitesPermission, hasSitePermission } from './registration';

export type PageAccessStatusReader = {
  read(tabId?: number): Promise<PageAccessStatus>;
  readFromContext(context: PageAccessStatusContext): Promise<PageAccessStatus>;
};

type PageAccessStatusReaderDeps = {
  temporaryTabActivationStore: TemporaryTabActivationStore;
};

function createBaseUnsupportedStatus(
  context: Extract<PageAccessStatusContext, { kind: 'missing-tab' | 'unsupported-url' }>,
  allSitesGranted: boolean
): PageAccessStatus {
  return {
    allSitesGranted,
    currentTabActive: false,
    currentTabId: context.kind === 'unsupported-url' ? context.tabId : null,
    currentTabOrigin: null,
    siteGranted: false,
    supported: false,
    unsupportedReason: context.kind,
  };
}

export function createPageAccessStatusReader({
  temporaryTabActivationStore,
}: PageAccessStatusReaderDeps): PageAccessStatusReader {
  async function readFromContext(context: PageAccessStatusContext): Promise<PageAccessStatus> {
    const allSitesGranted = await hasAllSitesPermission();
    if (context.kind !== 'supported') {
      return createBaseUnsupportedStatus(context, allSitesGranted);
    }

    const siteGranted = await hasSitePermission(context.target.url, allSitesGranted);
    const temporarilyActive = await temporaryTabActivationStore.has(context.target);
    return {
      allSitesGranted,
      currentTabActive:
        context.target.url.protocol === 'file:' ? siteGranted : temporarilyActive || siteGranted,
      currentTabId: context.target.tabId,
      currentTabOrigin: createPermissionScope(context.target.url),
      siteGranted,
      supported: true,
    };
  }

  return {
    async read(tabId) {
      return readFromContext(await resolveStatusContext(tabId));
    },
    readFromContext,
  };
}
