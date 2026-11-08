import { afterEach, expect, it, vi } from 'vitest';

import {
  createHttpsRedirectNetworkGuard,
  ensurePublicHttpsHeadGuard,
} from './https-redirect-guard';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

function ruleBlocksUrl(
  rules: chrome.declarativeNetRequest.Rule[],
  address: string,
  method: 'get' | 'head' | 'post'
): boolean {
  return rules.some(
    (rule) =>
      rule.action.type === 'block' &&
      rule.condition.requestMethods?.includes(method) === true &&
      Boolean(rule.condition.regexFilter && new URL(address).href.match(rule.condition.regexFilter))
  );
}

afterEach(() => vi.unstubAllGlobals());

it('keeps GET tab scope and HEAD cross-context scope in separate rule profiles', async () => {
  const updateSessionRules = vi.fn(
    async (_options: chrome.declarativeNetRequest.UpdateRuleOptions) => undefined
  );
  const browser = { getExtensionId: () => EXTENSION_ID, updateSessionRules };
  const getGuard = createHttpsRedirectNetworkGuard(browser, {
    ruleIdBase: 640_000,
    methods: ['get'],
    tabIds: [-1],
  });
  const headGuard = createHttpsRedirectNetworkGuard(browser, {
    ruleIdBase: 650_000,
    methods: ['head'],
    blockCredentials: true,
  });

  await getGuard.ensureInstalled();
  await headGuard.ensureInstalled();

  const getOptions = updateSessionRules.mock.calls[0]?.[0];
  const headOptions = updateSessionRules.mock.calls[1]?.[0];
  expect(getOptions?.removeRuleIds).toEqual(
    Array.from({ length: 18 }, (_, index) => 640_001 + index)
  );
  expect(headOptions?.removeRuleIds).toEqual(
    Array.from({ length: 19 }, (_, index) => 650_001 + index)
  );
  expect(getOptions?.addRules).toHaveLength(18);
  expect(headOptions?.addRules).toHaveLength(19);
  for (const rule of getOptions?.addRules ?? []) {
    expect(rule.condition).toEqual({
      initiatorDomains: [EXTENSION_ID],
      regexFilter: expect.any(String),
      requestMethods: ['get'],
      resourceTypes: ['xmlhttprequest'],
      tabIds: [-1],
    });
  }
  for (const rule of headOptions?.addRules ?? []) {
    expect(rule).toMatchObject({ priority: 10_000, action: { type: 'block' } });
    expect(rule.condition).toEqual({
      initiatorDomains: [EXTENSION_ID],
      regexFilter: expect.any(String),
      requestMethods: ['head'],
      resourceTypes: ['xmlhttprequest'],
    });
  }
  expect(ruleBlocksUrl(getOptions?.addRules ?? [], 'http://localhost/icon', 'head')).toBe(false);
  expect(ruleBlocksUrl(headOptions?.addRules ?? [], 'http://localhost/icon', 'get')).toBe(false);
  expect(
    ruleBlocksUrl(getOptions?.addRules ?? [], 'https://user:secret@example.com/icon', 'get')
  ).toBe(false);
});

it.each([
  'http://cdn.example.com/icon',
  'https://localhost/icon',
  'https://printer.local/icon',
  'https://foo.localhost./icon',
  'https://0.1.2.3/icon',
  'https://10.1.2.3/icon',
  'https://127.0.0.1/icon',
  'https://169.254.1.2/icon',
  'https://172.16.1.2/icon',
  'https://172.31.1.2/icon',
  'https://192.168.1.2/icon',
  'https://[::]/icon',
  'https://[::1]/icon',
  'https://[fc00::1]/icon',
  'https://[fdff::1]/icon',
  'https://[fe80::1]/icon',
  'https://[febf::1]/icon',
  'https://[fec0::1]/icon',
  'https://[::ffff:0.1.2.3]/icon',
  'https://[::ffff:10.1.2.3]/icon',
  'https://[::ffff:127.0.0.1]/icon',
  'https://[::ffff:169.254.1.2]/icon',
  'https://[::ffff:172.31.1.2]/icon',
  'https://[::ffff:192.168.1.2]/icon',
  'https://user@example.com/icon',
  'https://user:secret@example.com/icon',
  'https://:secret@example.com/icon',
])('blocks unsafe HEAD redirect target %s without affecting GET or POST', async (address) => {
  const updateSessionRules = vi.fn(
    async (_options: chrome.declarativeNetRequest.UpdateRuleOptions) => undefined
  );
  const guard = createHttpsRedirectNetworkGuard(
    { getExtensionId: () => EXTENSION_ID, updateSessionRules },
    { ruleIdBase: 650_000, methods: ['head'], blockCredentials: true }
  );
  await guard.ensureInstalled();
  const rules = updateSessionRules.mock.calls[0]?.[0].addRules ?? [];
  expect(ruleBlocksUrl(rules, address, 'head')).toBe(true);
  expect(ruleBlocksUrl(rules, address, 'get')).toBe(false);
  expect(ruleBlocksUrl(rules, address, 'post')).toBe(false);
});

it('permits public HTTPS HEAD destinations and DNS intranet names', async () => {
  const updateSessionRules = vi.fn(
    async (_options: chrome.declarativeNetRequest.UpdateRuleOptions) => undefined
  );
  const guard = createHttpsRedirectNetworkGuard(
    { getExtensionId: () => EXTENSION_ID, updateSessionRules },
    { ruleIdBase: 650_000, methods: ['head'], blockCredentials: true }
  );
  await guard.ensureInstalled();
  const rules = updateSessionRules.mock.calls[0]?.[0].addRules ?? [];
  for (const address of [
    'https://cdn.example.com/icon',
    'https://intranet/icon',
    'https://93.184.216.34/icon',
    'https://172.32.1.2/icon',
    'https://[fe7f::1]/icon',
    'https://[::ffff:8.8.8.8]/icon',
    'https://example.com/path@part?user=someone@example.com',
  ]) {
    expect(ruleBlocksUrl(rules, address, 'head'), address).toBe(false);
  }
});

it('shares an in-flight installation and retries once after a shared failure', async () => {
  const installation = Promise.withResolvers<void>();
  const updateSessionRules = vi
    .fn<(options: chrome.declarativeNetRequest.UpdateRuleOptions) => Promise<void>>()
    .mockReturnValueOnce(installation.promise)
    .mockResolvedValue(undefined);
  const guard = createHttpsRedirectNetworkGuard(
    { getExtensionId: () => EXTENSION_ID, updateSessionRules },
    { ruleIdBase: 650_000, methods: ['head'], blockCredentials: true }
  );
  const first = guard.ensureInstalled();
  const concurrent = guard.ensureInstalled();
  expect(concurrent).toBe(first);
  expect(updateSessionRules).toHaveBeenCalledOnce();
  const outcomes = Promise.allSettled([first, concurrent]);
  installation.reject(new Error('rules unavailable'));
  expect(await outcomes).toEqual([
    { status: 'rejected', reason: expect.objectContaining({ message: 'rules unavailable' }) },
    { status: 'rejected', reason: expect.objectContaining({ message: 'rules unavailable' }) },
  ]);
  const retry = guard.ensureInstalled();
  expect(guard.ensureInstalled()).toBe(retry);
  await retry;
  await guard.ensureInstalled();
  expect(updateSessionRules).toHaveBeenCalledTimes(2);
});

it('fails closed through the HEAD Chrome adapter and retries when DNR becomes available', async () => {
  const updateSessionRules = vi.fn(
    async (_options: chrome.declarativeNetRequest.UpdateRuleOptions) => undefined
  );
  vi.stubGlobal('chrome', { runtime: { id: EXTENSION_ID }, declarativeNetRequest: undefined });
  await expect(ensurePublicHttpsHeadGuard()).rejects.toThrow('HTTPS redirect guard is unavailable');
  Object.assign(chrome, { declarativeNetRequest: { updateSessionRules } });
  await expect(ensurePublicHttpsHeadGuard()).resolves.toBeUndefined();
  expect(updateSessionRules).toHaveBeenCalledOnce();
  expect(updateSessionRules.mock.calls[0]?.[0].addRules).toHaveLength(19);
});
