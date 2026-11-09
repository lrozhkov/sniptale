import { browserTabs } from '@sniptale/platform/browser/tabs';
import { isPrivateNetworkHost } from '@sniptale/platform/security/private-network-host';

function pageUrl(address: string): URL | null {
  try {
    const url = new URL(address.includes('://') ? address.trim() : `https://${address.trim()}`);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hostname.includes('*') ||
      isPrivateNetworkHost(url.hostname)
    )
      return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

/** Read an advisory icon only for the explicitly requested origin. Do not navigate or execute page scripts. */
export async function findOpenPageFavicon(
  address: string,
  signal: AbortSignal
): Promise<string | null> {
  signal.throwIfAborted();
  const target = pageUrl(address);
  if (!target) return null;
  try {
    const tabs = await browserTabs.query({ url: `https://${target.hostname}/*` });
    signal.throwIfAborted();
    const matches = tabs.flatMap((tab) => {
      if (
        typeof tab.url !== 'string' ||
        typeof tab.favIconUrl !== 'string' ||
        !tab.favIconUrl ||
        tab.favIconUrl.length > 2048
      )
        return [];
      const page = pageUrl(tab.url);
      if (!page || page.origin !== target.origin) return [];
      return [{ page: page.href, icon: tab.favIconUrl }];
    });
    const exact = matches.filter((item) => item.page === target.href);
    const icons = new Set((exact.length ? exact : matches).map((item) => item.icon));
    return icons.size === 1 ? [...icons][0]! : null;
  } catch {
    signal.throwIfAborted();
    return null;
  }
}
