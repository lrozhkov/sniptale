import type {
  PageAccessMessage,
  PageAccessResponse,
} from '@sniptale/runtime-contracts/messaging/page-access';
import { createPageAccessService, type PageAccessService } from './service-factory';
import { temporaryTabActivationStore } from './tab-activation';

export { createPageAccessService };
export type { PageAccessService };

const defaultPageAccessService = createPageAccessService({
  temporaryTabActivationStore,
});

export async function hasActivePageAccess(tabId: number): Promise<boolean> {
  return defaultPageAccessService.hasActivePageAccess(tabId);
}

export async function refreshActivePageAccessRuntime(tabId: number): Promise<boolean> {
  return defaultPageAccessService.refreshActivePageAccessRuntime(tabId);
}

export async function ensureActivePageAccessRuntime(
  tabId: number,
  failureMessage?: string
): Promise<void> {
  await defaultPageAccessService.ensureActivePageAccessRuntime(tabId, failureMessage);
}

export async function ensureNativeVisibleCaptureAuthority(
  tabId: number,
  failureMessage?: string
): Promise<void> {
  await defaultPageAccessService.ensureNativeVisibleCaptureAuthority(tabId, failureMessage);
}

export async function handlePageAccessMessage(
  message: PageAccessMessage
): Promise<PageAccessResponse> {
  return defaultPageAccessService.handlePageAccessMessage(message);
}

export async function clearPageAccessTabActivation(tabId: number): Promise<void> {
  await defaultPageAccessService.clearPageAccessTabActivation(tabId);
}

export async function unregisterRemovedPageAccessOrigins(origins: string[]): Promise<void> {
  await defaultPageAccessService.unregisterRemovedPageAccessOrigins(origins);
}
