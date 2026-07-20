import { describe, expect, it } from 'vitest';

import {
  type CapabilityContext,
  createCapabilityContext,
  isCapabilityContextAuthorized,
  resolveCapabilityOrigin,
} from '@sniptale/platform/security/capability-context';

function createPopupCapabilityContext(): CapabilityContext {
  return createCapabilityContext({
    expiresAtEpochMs: 1_000,
    origin: 'chrome-extension://extension-id',
    scopes: ['ipc:popup-export-tab-route'],
    tabId: 7,
    token: 'capability-token',
  });
}

describe('CapabilityContext', () => {
  it('authorizes only matching token, scope, tab, origin, and freshness', () => {
    const context = createPopupCapabilityContext();

    expect(
      isCapabilityContextAuthorized(context, {
        nowEpochMs: 999,
        origin: 'chrome-extension://extension-id',
        scope: 'ipc:popup-export-tab-route',
        tabId: 7,
        token: 'capability-token',
      })
    ).toBe(true);
  });

  it('rejects wrong scope and stale context', () => {
    const context = createPopupCapabilityContext();

    expect(
      isCapabilityContextAuthorized(context, {
        nowEpochMs: 999,
        origin: 'chrome-extension://extension-id',
        scope: 'offscreen:runtime',
        tabId: 7,
        token: 'capability-token',
      })
    ).toBe(false);
    expect(
      isCapabilityContextAuthorized(context, {
        nowEpochMs: 1_000,
        origin: 'chrome-extension://extension-id',
        scope: 'ipc:popup-export-tab-route',
        tabId: 7,
        token: 'capability-token',
      })
    ).toBe(false);
  });

  it('normalizes URL origins without trusting malformed values', () => {
    expect(
      resolveCapabilityOrigin(
        'chrome-extension://extension-id/apps/extension/src/popup/index.html#x'
      )
    ).toBe('chrome-extension://extension-id');
    expect(resolveCapabilityOrigin('not a url')).toBeNull();
  });
});
