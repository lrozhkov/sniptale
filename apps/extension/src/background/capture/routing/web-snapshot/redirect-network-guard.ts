import {
  createHttpsRedirectNetworkGuard,
  type HttpsRedirectGuardBrowser,
} from '../../../../platform/network/https-redirect-guard';

/** Retain the background capture GET profile and its existing rule identities. */
export function createWebSnapshotRedirectNetworkGuard(browser: HttpsRedirectGuardBrowser) {
  return createHttpsRedirectNetworkGuard(browser, {
    ruleIdBase: 640_000,
    methods: ['get'],
    tabIds: [-1],
  });
}

const redirectNetworkGuard = createWebSnapshotRedirectNetworkGuard({
  getExtensionId() {
    return chrome.runtime.id;
  },
  updateSessionRules(options) {
    if (!chrome.declarativeNetRequest?.updateSessionRules) {
      return Promise.reject(new Error('redirect network guard is unavailable'));
    }
    return chrome.declarativeNetRequest.updateSessionRules(options);
  },
});

export function ensureWebSnapshotRedirectNetworkGuard(): Promise<void> {
  return redirectNetworkGuard.ensureInstalled();
}
