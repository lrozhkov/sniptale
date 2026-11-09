const REDIRECT_GUARD_PRIORITY = 10_000;

const BLOCKED_REDIRECT_RULE_SPECS = [
  { offset: 1, regexFilter: '^http://' },
  {
    offset: 2,
    regexFilter: '^https://([^/?#@]*@)?([^./:]+\\.)*(localhost|local)\\.?(:[0-9]+)?/',
  },
  {
    offset: 3,
    regexFilter: '^https://([^/?#@]*@)?0\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    offset: 4,
    regexFilter: '^https://([^/?#@]*@)?10\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    offset: 5,
    regexFilter: '^https://([^/?#@]*@)?127\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    offset: 6,
    regexFilter: '^https://([^/?#@]*@)?169\\.254\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    offset: 7,
    regexFilter:
      '^https://([^/?#@]*@)?172\\.(1[6-9]|2[0-9]|3[01])\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    offset: 8,
    regexFilter: '^https://([^/?#@]*@)?192\\.168\\.[0-9]{1,3}\\.[0-9]{1,3}(:[0-9]+)?/',
  },
  {
    offset: 9,
    regexFilter: '^https://([^/?#@]*@)?\\[(::|::1)\\](:[0-9]+)?/',
  },
  {
    offset: 10,
    regexFilter: '^https://([^/?#@]*@)?\\[f[cd][0-9a-f]{2}:[0-9a-f:]+\\](:[0-9]+)?/',
  },
  {
    offset: 11,
    regexFilter: '^https://([^/?#@]*@)?\\[fe[89ab][0-9a-f]:[0-9a-f:]+\\](:[0-9]+)?/',
  },
  {
    offset: 12,
    regexFilter: '^https://([^/?#@]*@)?\\[fe[c-f][0-9a-f]:[0-9a-f:]+\\](:[0-9]+)?/',
  },
  {
    offset: 13,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:[0-9a-f]{1,2}:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    offset: 14,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:a[0-9a-f]{2}:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    offset: 15,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    offset: 16,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:a9fe:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    offset: 17,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:ac1[0-9a-f]:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
  {
    offset: 18,
    regexFilter: '^https://([^/?#@]*@)?\\[::ffff:c0a8:[0-9a-f]{1,4}\\](:[0-9]+)?/',
  },
] as const;

export interface HttpsRedirectGuardBrowser {
  getExtensionId(): string;
  updateSessionRules(options: chrome.declarativeNetRequest.UpdateRuleOptions): Promise<void>;
}

interface HttpsRedirectGuardScope {
  ruleIdBase: number;
  methods: readonly ('get' | 'head')[];
  tabIds?: readonly number[];
  blockCredentials?: boolean;
}

function createRedirectGuardRules(
  extensionId: string,
  scope: HttpsRedirectGuardScope
): chrome.declarativeNetRequest.Rule[] {
  const specs: { offset: number; regexFilter: string }[] = [...BLOCKED_REDIRECT_RULE_SPECS];
  if (scope.blockCredentials) specs.push({ offset: 19, regexFilter: '^https://[^/?#]*@' });
  return specs.map((spec) => {
    return {
      id: scope.ruleIdBase + spec.offset,
      priority: REDIRECT_GUARD_PRIORITY,
      action: { type: 'block' },
      condition: {
        initiatorDomains: [extensionId],
        regexFilter: spec.regexFilter,
        requestMethods: [...scope.methods],
        resourceTypes: ['xmlhttprequest'],
        ...(scope.tabIds ? { tabIds: [...scope.tabIds] } : {}),
      },
    };
  });
}

export function createHttpsRedirectNetworkGuard(
  browser: HttpsRedirectGuardBrowser,
  scope: HttpsRedirectGuardScope
): {
  ensureInstalled(): Promise<void>;
} {
  let installed: Promise<void> | null = null;

  return {
    ensureInstalled() {
      if (!installed) {
        const rules = createRedirectGuardRules(browser.getExtensionId(), scope);
        installed = browser
          .updateSessionRules({
            addRules: rules,
            removeRuleIds: rules.map((rule) => rule.id),
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

const headGuard = createHttpsRedirectNetworkGuard(
  {
    getExtensionId: () => chrome.runtime.id,
    updateSessionRules(options) {
      if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest?.updateSessionRules)
        return Promise.reject(new Error('HTTPS redirect guard is unavailable'));
      return chrome.declarativeNetRequest.updateSessionRules(options);
    },
  },
  { ruleIdBase: 650_000, methods: ['head'], blockCredentials: true }
);

/** Install before an anonymous extension HEAD can follow a redirect. */
export function ensurePublicHttpsHeadGuard(): Promise<void> {
  return headGuard.ensureInstalled();
}
