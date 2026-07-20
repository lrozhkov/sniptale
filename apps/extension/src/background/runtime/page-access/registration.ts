import { browserPermissions } from '@sniptale/platform/browser/permissions';
export { getMissingOriginPermissions } from '@sniptale/platform/browser/permissions';
import { browserScripting } from '@sniptale/platform/browser/scripting';
import {
  ALL_SITES_CONTENT_SCRIPT_MATCHES,
  ALL_SITES_ORIGIN_PATTERNS,
  LEGACY_ALL_SITES_ORIGIN_PATTERNS,
  PAGE_ACCESS_ALL_SITES_SCRIPT_ID,
} from './constants';
import {
  createOriginPattern,
  createSiteScriptId,
  isSupportedUrl,
  type SupportedPageTarget,
} from './target';

// Current-tab activation uses dynamic injection. Site/all-sites grants use persistent
// chrome.scripting registration. Manifest content_scripts are intentionally forbidden.
const CONTENT_RUNTIME_FILE = 'assets/contentRuntime.js';
const CONTENT_RUNTIME_SHIM_FILE = 'assets/contentRuntimeShim.js';

export async function hasAllSitesPermission(): Promise<boolean> {
  return browserPermissions.contains({ origins: [...ALL_SITES_ORIGIN_PATTERNS] });
}

export async function hasSitePermission(url: URL, allSitesGranted: boolean): Promise<boolean> {
  if (allSitesGranted) {
    return true;
  }

  return browserPermissions.contains({ origins: [createOriginPattern(url)] });
}

export async function ensureContentScriptRegistration(args: {
  id: string;
  matches: string[];
}): Promise<void> {
  const registered = await browserScripting.getRegisteredContentScripts({ ids: [args.id] });
  const [existing] = registered;
  if (existing && isExpectedContentScriptRegistration(existing, args)) {
    return;
  }

  if (existing) {
    await browserScripting.unregisterContentScripts({ ids: [args.id] });
  }

  await browserScripting.registerContentScripts([
    {
      allFrames: false,
      id: args.id,
      js: [CONTENT_RUNTIME_SHIM_FILE],
      matches: args.matches,
      persistAcrossSessions: true,
      runAt: 'document_idle',
    },
  ]);
}

function isExpectedContentScriptRegistration(
  existing: chrome.scripting.RegisteredContentScript,
  expected: { id: string; matches: string[] }
): boolean {
  return (
    existing.id === expected.id &&
    JSON.stringify(existing.js ?? []) === JSON.stringify([CONTENT_RUNTIME_SHIM_FILE]) &&
    JSON.stringify(existing.matches ?? []) === JSON.stringify(expected.matches) &&
    existing.allFrames === false &&
    existing.persistAcrossSessions === true &&
    existing.runAt === 'document_idle'
  );
}

export async function injectContentRuntime(
  target: SupportedPageTarget,
  options: { allFrames: boolean }
): Promise<void> {
  await browserScripting.executeScript({
    files: [CONTENT_RUNTIME_FILE],
    injectImmediately: false,
    target: { allFrames: options.allFrames, tabId: target.tabId },
  });
}

export async function reconcilePersistentContentScriptRegistrations(): Promise<void> {
  const permissions = await browserPermissions.getAll();
  const origins = permissions.origins ?? [];

  if (hasAllSitesOriginGrant(origins)) {
    await ensureContentScriptRegistration({
      id: PAGE_ACCESS_ALL_SITES_SCRIPT_ID,
      matches: [...ALL_SITES_CONTENT_SCRIPT_MATCHES],
    });
  }

  await Promise.all(
    origins
      .filter((origin) => !isAllSitesOrigin(origin))
      .filter((origin) => origin.endsWith('/*') && isSupportedUrl(origin.slice(0, -2)))
      .map((origin) => {
        const url = new URL(origin.slice(0, -2));
        return ensureContentScriptRegistration({
          id: createSiteScriptId(url),
          matches: [createOriginPattern(url)],
        });
      })
  );
}

async function unregisterAllSitesContentScript(): Promise<void> {
  await browserScripting.unregisterContentScripts({ ids: [PAGE_ACCESS_ALL_SITES_SCRIPT_ID] });
}

export async function unregisterSiteContentScript(id: string): Promise<void> {
  await browserScripting.unregisterContentScripts({ ids: [id] });
}

export async function unregisterRemovedContentScripts(origins: string[]): Promise<void> {
  if (origins.some(isAllSitesOrigin)) {
    await unregisterAllSitesContentScript();
  }

  await Promise.all(
    origins
      .filter((origin) => !isAllSitesOrigin(origin))
      .filter((origin) => origin.endsWith('/*') && isSupportedUrl(origin.slice(0, -2)))
      .map((origin) =>
        unregisterSiteContentScript(createSiteScriptId(new URL(origin.slice(0, -2))))
      )
  );
}

function isAllSitesOrigin(origin: string): boolean {
  return origin === '<all_urls>' || origin === 'http://*/*' || origin === 'https://*/*';
}

function hasAllSitesOriginGrant(origins: readonly string[]): boolean {
  return (
    ALL_SITES_ORIGIN_PATTERNS.every((origin) => origins.includes(origin)) ||
    LEGACY_ALL_SITES_ORIGIN_PATTERNS.every((origin) => origins.includes(origin))
  );
}
