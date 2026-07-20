/**
 * Shared offscreen-document seam for background runtime orchestration.
 */
interface BrowserOffscreenAdapter {
  closeDocument(): Promise<void>;
  createDocument(options: chrome.offscreen.CreateParameters): Promise<void>;
}

export const browserOffscreen: BrowserOffscreenAdapter = {
  closeDocument() {
    return chrome.offscreen.closeDocument();
  },
  createDocument(options) {
    return chrome.offscreen.createDocument(options);
  },
};
