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
    regexFilter: '^https://([^/?#@]*@)?0\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    id: 640_004,
    regexFilter: '^https://([^/?#@]*@)?10\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    id: 640_005,
    regexFilter: '^https://([^/?#@]*@)?127\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    id: 640_006,
    regexFilter: '^https://([^/?#@]*@)?169\\.254\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    id: 640_007,
    regexFilter:
      '^https://([^/?#@]*@)?172\\.(1[6-9]|2[0-9]|3[01])\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    id: 640_008,
    regexFilter: '^https://([^/?#@]*@)?192\\.168\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    id: 640_009,
    regexFilter: '^https://([^/?#@]*@)?\\[(::|::1)\\](:[0-9]+)?/',
  },
  {
    id: 640_010,
    regexFilter: '^https://([^/?#@]*@)?\\[f[cd][0-9a-f]{2}:[0-9a-f:]+\\](:[0-9]+)?/',
  },
  {
    id: 640_011,
    regexFilter: '^https://([^/?#@]*@)?\\[fe[89ab][0-9a-f]:[0-9a-f:]+\\](:[0-9]+)?/',
  },
  {
    id: 640_012,
    regexFilter: '^https://([^/?#@]*@)?\\[fe[c-f][0-9a-f]:[0-9a-f:]+\\](:[0-9]+)?/',
  },
  {
    id: 640_013,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:[0-9a-f]{1,2}:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    id: 640_014,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:a[0-9a-f]{2}:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    id: 640_015,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    id: 640_016,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:a9fe:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    id: 640_017,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:ac1[0-9a-f]:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    id: 640_018,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:c0a8:[0-9a-f]{1,4}\\](:[0-9]+)?/',
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
