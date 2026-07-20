import { runChromeCallback, subscribeToChromeEvent } from './callback';

/**
 * Shared browser downloads seam for download orchestration and listeners.
 */
interface BrowserDownloadsAdapter {
  isAvailable(): boolean;
  download(options: chrome.downloads.DownloadOptions): Promise<number | undefined>;
  search(query: chrome.downloads.DownloadQuery): Promise<chrome.downloads.DownloadItem[]>;
  subscribeToChanged(
    listener: typeof chrome.downloads.onChanged.addListener extends (listener: infer T) => void
      ? T
      : never
  ): () => void;
}

export const browserDownloads: BrowserDownloadsAdapter = {
  isAvailable() {
    return typeof chrome !== 'undefined' && Boolean(chrome.downloads);
  },

  download(options) {
    if (!chrome.downloads) {
      return Promise.reject(new Error('chrome.downloads is unavailable'));
    }

    return runChromeCallback<number | undefined>(
      (callback) => chrome.downloads.download(options, callback),
      'chrome.downloads is unavailable'
    );
  },

  search(query) {
    if (!chrome.downloads) {
      return Promise.reject(new Error('chrome.downloads is unavailable'));
    }

    return runChromeCallback<chrome.downloads.DownloadItem[]>(
      (callback) => chrome.downloads.search(query, callback),
      'chrome.downloads is unavailable'
    );
  },

  subscribeToChanged(listener) {
    return subscribeToChromeEvent(chrome.downloads?.onChanged, listener);
  },
};
