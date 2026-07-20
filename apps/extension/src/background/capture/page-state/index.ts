import { browserScripting } from '@sniptale/platform/browser/scripting';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';

interface PageDimensions {
  scrollHeight: number;
  scrollWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

function hideFixedElementsInPage(contentRootId: string): number {
  const allElements = document.querySelectorAll('*');
  let hiddenCount = 0;

  allElements.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;

    const style = window.getComputedStyle(el);
    const isSniptaleContentHost = el.id === contentRootId;
    const isSniptaleToast = el.classList.contains('sniptale-toast');
    const isSniptaleFramesContainer = el.classList.contains('sniptale-frames-container');
    const isSniptaleInteractiveFrame = el.classList.contains('sniptale-interactive-frame');
    const isSniptaleFocusOverlay = el.classList.contains('sniptale-focus-overlay');
    const isSniptaleFrameContainer = el.classList.contains('sniptale-frame-container');
    const isSniptaleToolbarPortal = el.id === 'sniptale-toolbar-portal';
    const isSniptaleBlurOverlay = el.classList.contains('sniptale-blur-overlay');
    const isSniptaleHighlightContainer = el.classList.contains('sniptale-highlight-container');
    const isSniptaleHighlightHover = el.classList.contains('sniptale-highlight-hover');

    if (
      style.position === 'fixed' &&
      !isSniptaleContentHost &&
      !isSniptaleToast &&
      !isSniptaleFramesContainer &&
      !isSniptaleInteractiveFrame &&
      !isSniptaleFocusOverlay &&
      !isSniptaleFrameContainer &&
      !isSniptaleToolbarPortal &&
      !isSniptaleBlurOverlay &&
      !isSniptaleHighlightContainer &&
      !isSniptaleHighlightHover &&
      style.display !== 'none'
    ) {
      el.dataset['sniptaleFixed'] = 'true';
      el.dataset['sniptaleFixedHadDisplay'] = el.style.display ? 'true' : 'false';
      el.dataset['sniptaleFixedDisplay'] = el.style.display;
      el.style.display = 'none';
      hiddenCount++;
    }
  });

  return hiddenCount;
}

export async function getPageDimensions(tabId: number): Promise<PageDimensions> {
  const result = await browserScripting.executeScript({
    target: { tabId },
    func: () => {
      return {
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
      };
    },
  });

  if (!result || !result[0] || !result[0].result) {
    throw new Error('Failed to get page dimensions');
  }

  return result[0].result as PageDimensions;
}

export async function hideFixedElements(tabId: number): Promise<number> {
  const result = await browserScripting.executeScript({
    target: { tabId },
    func: hideFixedElementsInPage,
    args: [CONTENT_ROOT_ID],
  });

  return result?.[0]?.result || 0;
}

export async function restoreFixedElements(tabId: number): Promise<void> {
  await browserScripting.executeScript({
    target: { tabId },
    func: () => {
      document.querySelectorAll('[data-sniptale-fixed]').forEach((el) => {
        if (el instanceof HTMLElement) {
          const hadInlineDisplay = el.dataset['sniptaleFixedHadDisplay'] === 'true';
          const previousDisplay = el.dataset['sniptaleFixedDisplay'] ?? '';
          delete el.dataset['sniptaleFixed'];
          delete el.dataset['sniptaleFixedHadDisplay'];
          delete el.dataset['sniptaleFixedDisplay'];
          if (hadInlineDisplay) {
            el.style.display = previousDisplay;
          } else {
            el.style.removeProperty('display');
          }
        }
      });
    },
  });
}

export async function scrollPage(tabId: number, y: number): Promise<void> {
  await browserScripting.executeScript({
    target: { tabId },
    func: (scrollY: number) => {
      window.scrollTo(0, scrollY);
    },
    args: [y],
  });
}
