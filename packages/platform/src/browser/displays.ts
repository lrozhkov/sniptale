/** Shared browser display seam for work-area-aware window operations. */
interface BrowserDisplaysAdapter {
  getInfo(): Promise<chrome.system.display.DisplayUnitInfo[]>;
}

export const browserDisplays: BrowserDisplaysAdapter = {
  getInfo() {
    if (typeof chrome === 'undefined' || !chrome.system?.display?.getInfo) {
      return Promise.reject(new Error('chrome.system.display.getInfo is unavailable'));
    }
    return chrome.system.display.getInfo();
  },
};
