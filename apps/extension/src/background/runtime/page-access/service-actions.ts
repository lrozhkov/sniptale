import { browserPermissions } from '@sniptale/platform/browser/permissions';
import type { PageAccessResponse } from '@sniptale/runtime-contracts/messaging/page-access';
import {
  ALL_SITES_CONTENT_SCRIPT_MATCHES,
  ALL_SITES_ORIGIN_PATTERNS,
  PAGE_ACCESS_ALL_SITES_SCRIPT_ID,
} from './constants';
import {
  ensureContentScriptRegistration,
  getMissingOriginPermissions,
  hasAllSitesPermission,
  unregisterSiteContentScript,
} from './registration';
import { injectContentRuntimeAndAwaitReady } from './readiness';
import type { PageAccessStatusReader } from './status';
import { createOriginPattern, createSiteScriptId, type PageAccessStatusContext } from './target';
import type { TemporaryTabActivationStore } from './tab-activation';

export type PageAccessServiceContext = {
  statusReader: PageAccessStatusReader;
  temporaryTabActivationStore: TemporaryTabActivationStore;
};

export async function activateCurrentTab(
  context: PageAccessStatusContext,
  serviceContext: PageAccessServiceContext
): Promise<PageAccessResponse> {
  if (context.kind !== 'supported') {
    return {
      success: false,
      result: 'unsupported-url',
      status: await serviceContext.statusReader.readFromContext(context),
    };
  }

  if (await serviceContext.temporaryTabActivationStore.has(context.target)) {
    return {
      success: true,
      result: 'already-active',
      status: await serviceContext.statusReader.readFromContext(context),
    };
  }

  await injectContentRuntimeAndAwaitReady(context.target, { allFrames: true });
  await serviceContext.temporaryTabActivationStore.grant(context.target);
  return {
    success: true,
    result: 'activated',
    status: await serviceContext.statusReader.readFromContext(context),
  };
}

export async function grantSiteAccess(
  context: PageAccessStatusContext,
  statusReader: PageAccessStatusReader
): Promise<PageAccessResponse> {
  if (context.kind !== 'supported') {
    return {
      success: false,
      result: 'unsupported-url',
      status: await statusReader.readFromContext(context),
    };
  }

  const originPattern = createOriginPattern(context.target.url);
  const origins = [originPattern];
  const alreadyGranted = await browserPermissions.contains({ origins });
  const granted = alreadyGranted || (await browserPermissions.request({ origins }));
  if (!granted) {
    return {
      success: false,
      result: 'permission-denied',
      status: await statusReader.readFromContext(context),
    };
  }

  try {
    await ensureContentScriptRegistration({
      id: createSiteScriptId(context.target.url),
      matches: [originPattern],
    });
    await injectContentRuntimeAndAwaitReady(context.target, { allFrames: true });
  } catch (error) {
    if (!alreadyGranted) {
      await browserPermissions.remove({ origins });
    }
    throw error;
  }
  return { success: true, result: 'granted', status: await statusReader.readFromContext(context) };
}

export async function grantAllSitesAccess(
  context: PageAccessStatusContext,
  statusReader: PageAccessStatusReader
): Promise<PageAccessResponse> {
  const origins = [...ALL_SITES_ORIGIN_PATTERNS];
  const rollbackOrigins = await getMissingOriginPermissions(origins);
  const granted = rollbackOrigins.length === 0 || (await browserPermissions.request({ origins }));
  if (!granted) {
    return {
      success: false,
      result: 'permission-denied',
      status: await statusReader.readFromContext(context),
    };
  }

  try {
    await ensureContentScriptRegistration({
      id: PAGE_ACCESS_ALL_SITES_SCRIPT_ID,
      matches: [...ALL_SITES_CONTENT_SCRIPT_MATCHES],
    });
    if (context.kind === 'supported') {
      await injectContentRuntimeAndAwaitReady(context.target, { allFrames: true });
    }
  } catch (error) {
    if (rollbackOrigins.length > 0) {
      await browserPermissions.remove({ origins: rollbackOrigins });
    }
    throw error;
  }
  return { success: true, result: 'granted', status: await statusReader.readFromContext(context) };
}

export async function registerGrantedSiteAccess(
  context: PageAccessStatusContext,
  statusReader: PageAccessStatusReader
): Promise<PageAccessResponse> {
  if (context.kind !== 'supported') {
    return {
      success: false,
      result: 'unsupported-url',
      status: await statusReader.readFromContext(context),
    };
  }

  const originPattern = createOriginPattern(context.target.url);
  const granted = await browserPermissions.contains({ origins: [originPattern] });
  if (!granted) {
    return {
      success: false,
      result: 'permission-denied',
      status: await statusReader.readFromContext(context),
    };
  }

  await ensureContentScriptRegistration({
    id: createSiteScriptId(context.target.url),
    matches: [originPattern],
  });
  await injectContentRuntimeAndAwaitReady(context.target, { allFrames: true });
  return {
    success: true,
    result: 'registered',
    status: await statusReader.readFromContext(context),
  };
}

export async function registerGrantedAllSitesAccess(
  context: PageAccessStatusContext,
  options: { injectCurrentTab: boolean },
  statusReader: PageAccessStatusReader
): Promise<PageAccessResponse> {
  if (!(await hasAllSitesPermission())) {
    return {
      success: false,
      result: 'permission-denied',
      status: await statusReader.readFromContext(context),
    };
  }

  await ensureContentScriptRegistration({
    id: PAGE_ACCESS_ALL_SITES_SCRIPT_ID,
    matches: [...ALL_SITES_CONTENT_SCRIPT_MATCHES],
  });
  if (options.injectCurrentTab && context.kind === 'supported') {
    await injectContentRuntimeAndAwaitReady(context.target, { allFrames: true });
  }
  return {
    success: true,
    result: 'registered',
    status: await statusReader.readFromContext(context),
  };
}

export async function revokeSiteAccess(
  context: PageAccessStatusContext,
  serviceContext: PageAccessServiceContext
): Promise<PageAccessResponse> {
  if (context.kind !== 'supported') {
    return {
      success: false,
      result: 'unsupported-url',
      status: await serviceContext.statusReader.readFromContext(context),
    };
  }

  await serviceContext.temporaryTabActivationStore.clear(context.target.tabId);
  await browserPermissions.remove({ origins: [createOriginPattern(context.target.url)] });
  await unregisterSiteContentScript(createSiteScriptId(context.target.url));
  return {
    success: true,
    result: 'revoked',
    status: await serviceContext.statusReader.readFromContext(context),
  };
}
