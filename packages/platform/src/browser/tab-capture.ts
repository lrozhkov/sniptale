import { runChromeCallback } from './callback';

type TabCaptureOptions = chrome.tabCapture.GetMediaStreamOptions;

/**
 * Shared tab-capture seam for stream id acquisition and feature probing.
 */
interface BrowserTabCaptureAdapter {
  getMediaStreamId(options: TabCaptureOptions): Promise<string>;
  isMediaStreamIdSupported(): boolean;
}

export const browserTabCapture: BrowserTabCaptureAdapter = {
  getMediaStreamId(options) {
    return runChromeCallback<string | undefined>(
      (callback) => chrome.tabCapture.getMediaStreamId(options, callback),
      'chrome.tabCapture.getMediaStreamId is unavailable'
    ).then((streamId) => {
      if (!streamId) {
        throw new Error('No tab capture stream id returned.');
      }

      return streamId;
    });
  },

  isMediaStreamIdSupported() {
    return (
      typeof chrome !== 'undefined' &&
      typeof chrome.tabCapture !== 'undefined' &&
      typeof chrome.tabCapture.getMediaStreamId === 'function'
    );
  },
};
