const REDIRECT_GUARD_PRIORITY = 10_000;
const EXTENSION_REQUEST_TAB_ID = -1;

const BLOCKED_REDIRECT_RULE_SPECS = [
  { id: 640_001, regexFilter: '^http://' },
  {
    id: 640_002,
    regexFilter: '^https://([^/?#@]*@)?([^./:]+\\.)*(localhost|local)\\.?(:[0-9]+)?/',
  },
  {
    id: 640_003,
    regexFilter:
      '^https://([^/?#@]*@)?((0|10|127)\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}' +
      '|169\\.254\\.[0-9]{1,3}\\.[0-9]{1,3}' +
      '|172\\.(1[6-9]|2[0-9]|3[01])\\.[0-9]{1,3}\\.[0-9]{1,3}' +
      '|192\\.168\\.[0-9]{1,3}\\.[0-9]{1,3})(:[0-9]+)?/',
  },
  {
    id: 640_004,
    regexFilter:
      '^https://([^/?#@]*@)?\\[(::|::1|f[cd][0-9a-f]{2}:[0-9a-f:]+' +
      '|fe[89abcdef][0-9a-f]:[0-9a-f:]+' +
      '|::ffff:([0-9a-f]{1,2}|a[0-9a-f]{2}|7f[0-9a-f]{2}|a9fe|ac1[0-9a-f]|c0a8)' +
      ':[0-9a-f]{1,4})\\](:[0-9]+)?/',
  },
] as const;

interface RedirectNetworkGuardBrowser {
  getExtensionId(): string;
  updateSessionRules(options: chrome.declarativeNetRequest.UpdateRuleOptions): Promise<void>;
}

function createRedirectGuardRules(extensionId: string): chrome.declarativeNetRequest.Rule[] {
  return BLOCKED_REDIRECT_RULE_SPECS.map((spec) => {
    return {
      id: spec.id,
      priority: REDIRECT_GUARD_PRIORITY,
      action: { type: 'block' },
      condition: {
        initiatorDomains: [extensionId],
        regexFilter: spec.regexFilter,
        requestMethods: ['get'],
        resourceTypes: ['xmlhttprequest'],
        tabIds: [EXTENSION_REQUEST_TAB_ID],
      },
    };
  });
}

export function createWebSnapshotRedirectNetworkGuard(browser: RedirectNetworkGuardBrowser): {
  ensureInstalled(): Promise<void>;
} {
  let installed: Promise<void> | null = null;

  return {
    ensureInstalled() {
      if (!installed) {
        const rules = createRedirectGuardRules(browser.getExtensionId());
        installed = browser
          .updateSessionRules({
            addRules: rules,
            removeRuleIds: BLOCKED_REDIRECT_RULE_SPECS.map((spec) => spec.id),
          })
          .catch((error: unknown) => {
            installed = null;
            throw error;
          });
      }
      return installed;
    },
  };
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
