import { browserScripting } from '@sniptale/platform/browser/scripting';
import { isRestrictedBrowserPage } from '../../../../features/tab-capabilities/url';

function normalizeTitle(value: string | null | undefined): string | null {
  const title = value?.trim();
  return title ? title : null;
}

function readPageTitleMetadata(): string | null {
  const selectors = [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    'meta[name="title"]',
  ] as const;

  for (const selector of selectors) {
    const content = document.querySelector<HTMLMetaElement>(selector)?.content;
    const title = content?.trim();

    if (title) {
      return title;
    }
  }

  return document.title.trim() || null;
}

async function readMetadataTitle(tabId: number): Promise<string | null> {
  const result = await browserScripting.executeScript({
    target: { tabId },
    func: readPageTitleMetadata,
  });

  return normalizeTitle(result[0]?.result);
}

export async function resolvePageLinkTitle(tab: chrome.tabs.Tab): Promise<string> {
  const tabTitle = normalizeTitle(tab.title) ?? normalizeTitle(tab.url) ?? '';

  if (!tab.id || isRestrictedBrowserPage(tab.url)) {
    return tabTitle;
  }

  try {
    return (await readMetadataTitle(tab.id)) ?? tabTitle;
  } catch {
    return tabTitle;
  }
}
