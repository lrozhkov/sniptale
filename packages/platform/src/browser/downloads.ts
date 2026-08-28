import { runChromeCallback, subscribeToChromeEvent } from './callback';

/**
 * Shared browser downloads seam for download orchestration and listeners.
 */
interface BrowserDownloadsAdapter {
  isAvailable(): boolean;
  cancel(downloadId: number): Promise<void>;
  download(options: chrome.downloads.DownloadOptions): Promise<number | undefined>;
  search(query: chrome.downloads.DownloadQuery): Promise<chrome.downloads.DownloadItem[]>;
  subscribeToCreated(
    listener: typeof chrome.downloads.onCreated.addListener extends (listener: infer T) => void
      ? T
      : never
  ): () => void;
  subscribeToChanged(
    listener: typeof chrome.downloads.onChanged.addListener extends (listener: infer T) => void
      ? T
      : never
  ): () => void;
}

export const browserDownloads: BrowserDownloadsAdapter = {
  isAvailable() {
    return (
      typeof chrome !== 'undefined' &&
      typeof chrome.downloads?.download === 'function' &&
      Boolean(chrome.downloads.onChanged && chrome.downloads.onCreated)
    );
  },

  cancel(downloadId) {
    if (!chrome.downloads) {
      return Promise.reject(new Error('chrome.downloads is unavailable'));
    }

    return runChromeCallback<void>(
      (callback) => chrome.downloads.cancel(downloadId, callback),
      'chrome.downloads is unavailable'
    );
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

  subscribeToCreated(listener) {
    return subscribeToChromeEvent(chrome.downloads?.onCreated, listener);
  },

  subscribeToChanged(listener) {
    return subscribeToChromeEvent(chrome.downloads?.onChanged, listener);
  },
};
