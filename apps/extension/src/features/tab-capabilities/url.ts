import { runtimeInfo } from '@sniptale/platform/browser/runtime';

const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'edge://',
  'about:',
  'chrome-extension://',
  'moz-extension://',
  'devtools://',
  'chrome-devtools://',
  'chrome-search://',
  'view-source:',
  'opera://',
] as const;

export function describeRestrictedPage(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const prefix = RESTRICTED_URL_PREFIXES.find((item) => url.startsWith(item));
  if (!prefix) {
    return describeUnsupportedPageProtocol(url);
  }

  return prefix.replace(/:\/?\/?$/, '://');
}

function describeUnsupportedPageProtocol(url: string): string | null {
  try {
    const protocol = new URL(url).protocol;
    return protocol.endsWith(':') ? `${protocol}//` : protocol;
  } catch {
    return null;
  }
}

function isHttpPageUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function isRestrictedBrowserPage(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  return RESTRICTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix)) || !isHttpPageUrl(url);
}

export function isOwnedSnapshotViewerPage(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const viewerUrl = new URL(
      runtimeInfo.getURL('apps/extension/src/web-snapshot-viewer/index.html')
    );
    const candidateUrl = new URL(url);
    const snapshotId = candidateUrl.searchParams.get('snapshotId')?.trim();
    const viewerDirectoryPath = viewerUrl.pathname.replace(/index\.html$/, '');

    return (
      candidateUrl.origin === viewerUrl.origin &&
      (candidateUrl.pathname === viewerUrl.pathname ||
        candidateUrl.pathname === viewerDirectoryPath) &&
      Boolean(snapshotId)
    );
  } catch {
    return false;
  }
}
