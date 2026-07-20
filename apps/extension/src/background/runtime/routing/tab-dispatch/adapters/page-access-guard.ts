import { browserTabs } from '@sniptale/platform/browser/tabs';
import { isOwnedSnapshotViewerPage } from '../../../../../features/tab-capabilities/url';
import { ensureActivePageAccessRuntime, hasActivePageAccess } from '../../../page-access/service';
import { createRouteErrorResponse } from '../../../../routing-contracts/response';
import type { ResolvedTabRouteArgs } from './types';

export function routeWithPageAccess(args: ResolvedTabRouteArgs, route: () => boolean): boolean {
  void refreshPageAccess(args.resolvedTabId)
    .then(() => {
      route();
    })
    .catch((error: unknown) => {
      args.sendResponse(createRouteErrorResponse(error));
    });

  return true;
}

export function routeWithVerifiedPageAccess(
  args: ResolvedTabRouteArgs,
  authorize: () => boolean,
  route: () => boolean
): boolean {
  void verifyPageAccess(args.resolvedTabId)
    .then(() => {
      if (!authorize()) {
        return;
      }
      return refreshPageAccess(args.resolvedTabId).then(() => {
        route();
      });
    })
    .catch((error: unknown) => {
      args.sendResponse(createRouteErrorResponse(error));
    });

  return true;
}

async function isSnapshotViewerTab(tabId: number): Promise<boolean> {
  const tab = await browserTabs.get(tabId);
  return isOwnedSnapshotViewerPage(tab.url);
}

async function verifyPageAccess(tabId: number): Promise<void> {
  if (await isSnapshotViewerTab(tabId)) {
    return;
  }

  if (!(await hasActivePageAccess(tabId))) {
    throw new Error('Page access is required.');
  }
}

async function refreshPageAccess(tabId: number): Promise<void> {
  if (await isSnapshotViewerTab(tabId)) {
    return;
  }

  await ensureActivePageAccessRuntime(tabId);
}
