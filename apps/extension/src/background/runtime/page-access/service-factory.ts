import type {
  PageAccessMessage,
  PageAccessResponse,
} from '@sniptale/runtime-contracts/messaging/page-access';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import { resolveStatusContext } from './target';
import { createPageAccessStatusReader } from './status';
import {
  activateCurrentTab,
  grantAllSitesAccess,
  grantSiteAccess,
  registerGrantedAllSitesAccess,
  registerGrantedSiteAccess,
  revokeSiteAccess,
  type PageAccessServiceContext,
} from './service-actions';
import { unregisterRemovedContentScripts } from './registration';
import { injectContentRuntimeAndAwaitReady } from './readiness';
import type { TemporaryTabActivationStore } from './tab-activation';

export type PageAccessService = {
  clearPageAccessTabActivation(tabId: number): Promise<void>;
  ensureActivePageAccessRuntime(tabId: number, failureMessage?: string): Promise<void>;
  ensureNativeVisibleCaptureAuthority(tabId: number, failureMessage?: string): Promise<void>;
  handlePageAccessMessage(message: PageAccessMessage): Promise<PageAccessResponse>;
  hasActivePageAccess(tabId: number): Promise<boolean>;
  refreshActivePageAccessRuntime(tabId: number): Promise<boolean>;
  unregisterRemovedPageAccessOrigins(origins: string[]): Promise<void>;
};

type PageAccessServiceDeps = {
  temporaryTabActivationStore: TemporaryTabActivationStore;
};

function createPageAccessServiceContext(
  temporaryTabActivationStore: TemporaryTabActivationStore
): PageAccessServiceContext {
  return {
    statusReader: createPageAccessStatusReader({ temporaryTabActivationStore }),
    temporaryTabActivationStore,
  };
}

async function handlePageAccessMessageWithContext(
  message: PageAccessMessage,
  serviceContext: PageAccessServiceContext
): Promise<PageAccessResponse> {
  const context = await resolveStatusContext(message.tabId);

  switch (message.operation) {
    case PageAccessOperation.READ_STATUS:
      return {
        success: true,
        status: await serviceContext.statusReader.readFromContext(context),
      };
    case PageAccessOperation.ACTIVATE_CURRENT_TAB:
      return activateCurrentTab(context, serviceContext);
    case PageAccessOperation.GRANT_SITE:
      return grantSiteAccess(context, serviceContext.statusReader);
    case PageAccessOperation.GRANT_ALL_SITES:
      return grantAllSitesAccess(context, serviceContext.statusReader);
    case PageAccessOperation.REGISTER_GRANTED_SITE:
      return registerGrantedSiteAccess(context, serviceContext.statusReader);
    case PageAccessOperation.REGISTER_GRANTED_ALL_SITES:
      return registerGrantedAllSitesAccess(
        context,
        { injectCurrentTab: typeof message.tabId === 'number' },
        serviceContext.statusReader
      );
    case PageAccessOperation.REVOKE_SITE:
      return revokeSiteAccess(context, serviceContext);
    default:
      return { success: true, status: await serviceContext.statusReader.read(message.tabId) };
  }
}

async function hasActivePageAccessWithContext(
  tabId: number,
  serviceContext: PageAccessServiceContext
): Promise<boolean> {
  const status = await serviceContext.statusReader.read(tabId);
  return status.supported && status.currentTabActive;
}

async function refreshActivePageAccessRuntimeWithContext(
  tabId: number,
  serviceContext: PageAccessServiceContext
): Promise<boolean> {
  const context = await resolveStatusContext(tabId);
  if (context.kind !== 'supported') {
    return false;
  }

  const status = await serviceContext.statusReader.readFromContext(context);
  if (!status.currentTabActive) {
    return false;
  }

  await injectContentRuntimeAndAwaitReady(context.target, { allFrames: status.siteGranted });
  return true;
}

async function hasNativeVisibleCaptureAuthorityWithContext(
  tabId: number,
  serviceContext: PageAccessServiceContext
): Promise<boolean> {
  const context = await resolveStatusContext(tabId);
  if (context.kind !== 'supported') {
    return false;
  }

  const status = await serviceContext.statusReader.readFromContext(context);
  return (
    status.allSitesGranted || (await serviceContext.temporaryTabActivationStore.has(context.target))
  );
}

export function createPageAccessService({
  temporaryTabActivationStore,
}: PageAccessServiceDeps): PageAccessService {
  const serviceContext = createPageAccessServiceContext(temporaryTabActivationStore);

  const service: PageAccessService = {
    async clearPageAccessTabActivation(tabId) {
      await temporaryTabActivationStore.clear(tabId);
    },
    async ensureActivePageAccessRuntime(tabId, failureMessage = 'Page access is required.') {
      if (!(await service.refreshActivePageAccessRuntime(tabId))) {
        throw new Error(failureMessage);
      }
    },
    async ensureNativeVisibleCaptureAuthority(
      tabId,
      failureMessage = 'Visible capture requires all-sites access or active tab activation.'
    ) {
      if (!(await hasNativeVisibleCaptureAuthorityWithContext(tabId, serviceContext))) {
        throw new Error(failureMessage);
      }
    },
    async handlePageAccessMessage(message) {
      return handlePageAccessMessageWithContext(message, serviceContext);
    },
    async hasActivePageAccess(tabId) {
      return hasActivePageAccessWithContext(tabId, serviceContext);
    },
    async refreshActivePageAccessRuntime(tabId) {
      return refreshActivePageAccessRuntimeWithContext(tabId, serviceContext);
    },
    async unregisterRemovedPageAccessOrigins(origins) {
      await unregisterRemovedContentScripts(origins);
    },
  };
  return service;
}
