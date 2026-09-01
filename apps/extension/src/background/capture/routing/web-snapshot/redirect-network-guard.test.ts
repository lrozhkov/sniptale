import { expect, it, vi } from 'vitest';

import {
  createWebSnapshotRedirectNetworkGuard,
  ensureWebSnapshotRedirectNetworkGuard,
} from './redirect-network-guard';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

function ruleBlocksUrl(
  rules: chrome.declarativeNetRequest.Rule[],
  url: string,
  method: 'get' | 'post' = 'get'
): boolean {
  return rules.some((rule) => {
    const regexFilter = rule.condition.regexFilter;
    return (
      rule.action.type === 'block' &&
      rule.condition.requestMethods?.includes(method) === true &&
      Boolean(regexFilter && new RegExp(regexFilter, 'iu').test(new URL(url).href))
    );
  });
}

it('installs extension-scoped session rules that block unsafe GET redirect targets', async () => {
  const updateSessionRules = vi.fn(
    async (_options: chrome.declarativeNetRequest.UpdateRuleOptions) => undefined
  );
  const guard = createWebSnapshotRedirectNetworkGuard({
    getExtensionId: () => EXTENSION_ID,
    updateSessionRules,
  });

  await guard.ensureInstalled();

  const options = updateSessionRules.mock.calls[0]?.[0];
  expect(options).toBeDefined();
  expect(options?.removeRuleIds).toEqual(Array.from({ length: 18 }, (_, index) => 640_001 + index));
  expect(options?.addRules).toHaveLength(18);
  for (const rule of options?.addRules ?? []) {
    expect(rule).toMatchObject({
      action: { type: 'block' },
      condition: {
        initiatorDomains: [EXTENSION_ID],
        requestMethods: ['get'],
        resourceTypes: ['xmlhttprequest'],
        tabIds: [-1],
      },
    });
  }
});

it.each([
  'http://cdn.example.com/image.png',
  'https://localhost/image.png',
  'https://foo.localhost./image.png',
  'https://printer.local/image.png',
  'https://0.1.2.3/image.png',
  'https://10.1.2.3/image.png',
  'https://127.0.0.1/image.png',
  'https://169.254.1.2/image.png',
  'https://172.31.1.2/image.png',
  'https://192.168.1.2/image.png',
  'https://[::1]/image.png',
  'https://[fc00::1]/image.png',
  'https://[fdff::1]/image.png',
  'https://[fe90::1]/image.png',
  'https://[febf::1]/image.png',
  'https://[fec0::1]/image.png',
  'https://[::ffff:127.0.0.1]/image.png',
  'https://[::ffff:10.1.2.3]/image.png',
  'https://[::ffff:169.254.1.2]/image.png',
  'https://[::ffff:172.31.1.2]/image.png',
  'https://[::ffff:192.168.1.2]/image.png',
])('blocks %s before an extension-owned GET reaches the network', async (url) => {
  const updateSessionRules = vi.fn(
    async (_options: chrome.declarativeNetRequest.UpdateRuleOptions) => undefined
  );
  const guard = createWebSnapshotRedirectNetworkGuard({
    getExtensionId: () => EXTENSION_ID,
    updateSessionRules,
  });
  await guard.ensureInstalled();

  const options = updateSessionRules.mock.calls[0]?.[0];
  expect(options).toBeDefined();
  expect(ruleBlocksUrl(options?.addRules ?? [], url)).toBe(true);
});

it('keeps public HTTPS GETs and local AI POSTs outside the redirect guard', async () => {
  const updateSessionRules = vi.fn(
    async (_options: chrome.declarativeNetRequest.UpdateRuleOptions) => undefined
  );
  const guard = createWebSnapshotRedirectNetworkGuard({
    getExtensionId: () => EXTENSION_ID,
    updateSessionRules,
  });
  await guard.ensureInstalled();
  const options = updateSessionRules.mock.calls[0]?.[0];
  expect(options).toBeDefined();
  const rules = options?.addRules ?? [];

  expect(ruleBlocksUrl(rules, 'https://cdn.example.com/image.png')).toBe(false);
  expect(ruleBlocksUrl(rules, 'https://93.184.216.34/image.png')).toBe(false);
  expect(ruleBlocksUrl(rules, 'https://172.32.1.2/image.png')).toBe(false);
  expect(ruleBlocksUrl(rules, 'https://[fe7f::1]/image.png')).toBe(false);
  expect(ruleBlocksUrl(rules, 'https://[::ffff:8.8.8.8]/image.png')).toBe(false);
  expect(ruleBlocksUrl(rules, 'http://127.0.0.1:11434/v1/chat/completions', 'post')).toBe(false);
});

it('shares an installed guard and retries after installation failure', async () => {
  const updateSessionRules = vi
    .fn<(options: chrome.declarativeNetRequest.UpdateRuleOptions) => Promise<void>>()
    .mockRejectedValueOnce(new Error('rules unavailable'))
    .mockResolvedValue(undefined);
  const guard = createWebSnapshotRedirectNetworkGuard({
    getExtensionId: () => EXTENSION_ID,
    updateSessionRules,
  });

  await expect(guard.ensureInstalled()).rejects.toThrow('rules unavailable');
  await expect(guard.ensureInstalled()).resolves.toBeUndefined();
  await expect(guard.ensureInstalled()).resolves.toBeUndefined();
  expect(updateSessionRules).toHaveBeenCalledTimes(2);
});

it('fails closed through the Chrome adapter and retries when the rules API becomes available', async () => {
  const updateSessionRules = vi.fn(
    async (_options: chrome.declarativeNetRequest.UpdateRuleOptions) => undefined
  );
  vi.stubGlobal('chrome', {
    runtime: { id: EXTENSION_ID },
    declarativeNetRequest: undefined,
  });

  await expect(ensureWebSnapshotRedirectNetworkGuard()).rejects.toThrow(
    'redirect network guard is unavailable'
  );
  Object.assign(chrome, { declarativeNetRequest: { updateSessionRules } });
  await expect(ensureWebSnapshotRedirectNetworkGuard()).resolves.toBeUndefined();
  expect(updateSessionRules).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
