import { runChromeCallback, subscribeToChromeEvent } from './callback';

type RuntimeMessageListener = typeof chrome.runtime.onMessage.addListener extends (
  listener: infer T
) => void
  ? T
  : never;
type RuntimeConnectListener = typeof chrome.runtime.onConnect.addListener extends (
  listener: infer T
) => void
  ? T
  : never;
type RuntimeInstalledListener = typeof chrome.runtime.onInstalled.addListener extends (
  listener: infer T
) => void
  ? T
  : never;

/**
 * Shared runtime metadata seam for manifest, URLs, and runtime diagnostics.
 */
interface RuntimeInfoAdapter {
  getPlatformInfo(): Promise<chrome.runtime.PlatformInfo>;
  getManifest(): chrome.runtime.Manifest;
  getURL(path: string): string;
  getLastError(): chrome.runtime.LastError | undefined;
  getContexts(filter: chrome.runtime.ContextFilter): Promise<chrome.runtime.ExtensionContext[]>;
}

/**
 * Shared browser runtime seam for runtime message listener ownership and runtime metadata.
 */
interface BrowserRuntimeAdapter extends RuntimeInfoAdapter {
  connect(connectInfo?: chrome.runtime.ConnectInfo): chrome.runtime.Port;
  subscribeToConnections(listener: RuntimeConnectListener): () => void;
  subscribeToInstalled(listener: RuntimeInstalledListener): () => void;
  subscribeToMessages(listener: RuntimeMessageListener): () => void;
}

export const runtimeInfo: RuntimeInfoAdapter = {
  getPlatformInfo() {
    return runChromeCallback(
      (callback) => chrome.runtime.getPlatformInfo(callback),
      'chrome.runtime.getPlatformInfo is unavailable'
    );
  },

  getManifest() {
    return chrome.runtime.getManifest();
  },

  getURL(path) {
    return chrome.runtime.getURL(path);
  },

  getLastError() {
    return chrome.runtime.lastError;
  },

  getContexts(filter) {
    return chrome.runtime.getContexts(filter);
  },
};

export const browserRuntime: BrowserRuntimeAdapter = {
  ...runtimeInfo,

  connect(connectInfo) {
    return chrome.runtime.connect(connectInfo);
  },

  subscribeToMessages(listener) {
    return subscribeToChromeEvent(chrome.runtime?.onMessage, listener);
  },
  subscribeToConnections(listener) {
    return subscribeToChromeEvent(chrome.runtime?.onConnect, listener);
  },
  subscribeToInstalled(listener) {
    return subscribeToChromeEvent(chrome.runtime?.onInstalled, listener);
  },
};
