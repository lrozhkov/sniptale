import { browserTabs } from '@sniptale/platform/browser/tabs';
import { PAGE_ACCESS_SITE_SCRIPT_PREFIX } from './constants';

export type SupportedPageTarget = {
  tab: chrome.tabs.Tab;
  tabId: number;
  url: URL;
};

export type PageAccessStatusContext =
  | { kind: 'supported'; target: SupportedPageTarget }
  | { kind: 'missing-tab' }
  | { kind: 'unsupported-url'; tabId: number | null };

export function createOriginPattern(url: URL): string {
  return `${url.origin}/*`;
}

function encodeScriptIdSegment(value: string): string {
  return btoa(value).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

export function createSiteScriptId(url: URL): string {
  return `${PAGE_ACCESS_SITE_SCRIPT_PREFIX}-${encodeScriptIdSegment(url.origin)}`;
}

export function isSupportedUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function resolveCurrentTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
  if (typeof tabId === 'number') {
    return browserTabs.get(tabId);
  }

  const [activeTab] = await browserTabs.query({ active: true, currentWindow: true });
  return activeTab ?? null;
}

export async function resolveStatusContext(tabId?: number): Promise<PageAccessStatusContext> {
  const tab = await resolveCurrentTab(tabId);
  if (!tab || typeof tab.id !== 'number') {
    return { kind: 'missing-tab' };
  }

  if (!isSupportedUrl(tab.url)) {
    return { kind: 'unsupported-url', tabId: tab.id };
  }

  return {
    kind: 'supported',
    target: {
      tab,
      tabId: tab.id,
      url: new URL(tab.url),
    },
  };
}
