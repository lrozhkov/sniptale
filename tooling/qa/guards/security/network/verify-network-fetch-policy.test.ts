import { describe, expect, it } from 'vitest';

import { createTempRoot, writeFile, writeJson } from '../../../test-support/test-helpers';
import { collectNetworkFetchPolicyViolations } from './verify-network-fetch-policy.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-network-ownership.data.json';
const OWNER_PATH = 'apps/extension/src/background/capture/routing/web-snapshot/fetch.ts';

function policy(root: string, ownerPath = OWNER_PATH, requestPolicy?: string) {
  writeJson(root, POLICY_PATH, {
    anonymousPublicFetchOwners: [
      {
        file: ownerPath,
        ...(requestPolicy ? { requestPolicy } : {}),
        owner: 'fixture-owner',
        justification: 'Fixture public fetch owner.',
        reviewNote: 'Fixture review contract.',
      },
    ],
    credentialedFetchOwners: [],
    secretHeaderOwners: [],
  });
}

function safeSource(fetchBinding = 'fetch') {
  return [
    "import { isPrivateNetworkHost } from '@sniptale/platform/security/private-network-host';",
    "import { beginWebSnapshotAssetFetch } from './session';",
    "import { ensureWebSnapshotRedirectNetworkGuard } from './redirect-network-guard';",
    fetchBinding === 'fetch' ? '' : `const ${fetchBinding} = fetch;`,
    'function validateFetchUrl(value: string) {',
    '  const parsed = new URL(value);',
    "  if (parsed.protocol !== 'https:' || isPrivateNetworkHost(parsed.hostname)) throw new Error('blocked');",
    '  return parsed;',
    '}',
    'export async function load(url: string) {',
    '  const parsed = validateFetchUrl(url);',
    '  const authority = beginWebSnapshotAssetFetch({ url: parsed.href });',
    "  const redirect = authority.allowExternalAssetRedirects ? 'follow' : 'manual';",
    "  if (redirect === 'follow') await ensureWebSnapshotRedirectNetworkGuard();",
    `  const response = await ${fetchBinding}(parsed.href, {`,
    "    credentials: 'omit', redirect, signal: authority.signal",
    '  });',
    "  if (response.type === 'opaqueredirect' || response.status >= 300) throw new Error('redirect');",
    '  const responseUrl = response.url;',
    '  validateFetchUrl(responseUrl);',
    '  return response;',
    '}',
    '',
  ].join('\n');
}

function collect(source: string) {
  const root = createTempRoot('network-fetch-policy-');
  policy(root);
  const file = writeFile(root, OWNER_PATH, source);
  return collectNetworkFetchPolicyViolations([file], { policyPath: POLICY_PATH, rootDir: root });
}

describe('network fetch policy', () => {
  it('accepts policy bound to the actual URL, session authority, request, redirect, and response', () => {
    expect(collect(safeSource())).toEqual([]);
  });

  it('recognizes an aliased global fetch without losing the per-sink contract', () => {
    expect(collect(safeSource('request'))).toEqual([]);
  });

  it.each([
    ['raw target', (source: string) => source.replace('fetch(parsed.href', 'fetch(url')],
    [
      'missing anonymous credentials',
      (source: string) => source.replace("credentials: 'omit', ", ''),
    ],
    [
      'redirect detached from authority',
      (source: string) => source.replace('redirect, signal', "redirect: 'follow', signal"),
    ],
    [
      'signal detached from authority',
      (source: string) => source.replace('signal: authority.signal', 'signal: controller.signal'),
    ],
    [
      'missing redirect rejection',
      (source: string) =>
        source.replace(
          "  if (response.type === 'opaqueredirect' || response.status >= 300) throw new Error('redirect');\n",
          ''
        ),
    ],
    [
      'missing pre-network redirect guard',
      (source: string) =>
        source.replace(
          "  if (redirect === 'follow') await ensureWebSnapshotRedirectNetworkGuard();\n",
          ''
        ),
    ],
    [
      'unawaited pre-network redirect guard',
      (source: string) =>
        source.replace(
          "  if (redirect === 'follow') await ensureWebSnapshotRedirectNetworkGuard();",
          "  if (redirect === 'follow') ensureWebSnapshotRedirectNetworkGuard();"
        ),
    ],
    [
      'missing final URL validation',
      (source: string) => source.replace('  validateFetchUrl(responseUrl);\n', ''),
    ],
    [
      'fake validator without private-network check',
      (source: string) => source.replace(' || isPrivateNetworkHost(parsed.hostname)', ''),
    ],
  ])('blocks %s', (_label, mutate) => {
    expect(collect(mutate(safeSource()))).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'network-fetch-policy-missing' })])
    );
  });

  it('does not let a comment or unrelated validator waive a raw sink', () => {
    const source = safeSource().replace(
      '  const parsed = validateFetchUrl(url);',
      '  // validateFetchUrl(url);\n  const parsed = new URL(url);'
    );
    expect(collect(source)).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'network-fetch-policy-missing' })])
    );
  });

  it('checks every fetch in the registered owner', () => {
    const source = safeSource().replace(
      '  return response;',
      '  await fetch(url);\n  return response;'
    );
    expect(
      collect(source).filter(({ rule }) => rule === 'network-fetch-policy-missing')
    ).toHaveLength(1);
  });

  it('rejects a stale registry entitlement with no fetch sink', () => {
    const root = createTempRoot('network-fetch-policy-stale-');
    policy(root);
    const file = writeFile(root, OWNER_PATH, 'export const value = 1;\n');
    expect(
      collectNetworkFetchPolicyViolations([file], { policyPath: POLICY_PATH, rootDir: root })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'network-fetch-policy-stale-owner' }),
      ])
    );
  });
});

const HEAD_OWNER_PATH = 'apps/extension/src/platform/network/https-redirects.ts';

function safeHeadSource() {
  return [
    "import { isPrivateNetworkHost } from '@sniptale/platform/security/private-network-host';",
    "import { ensurePublicHttpsHeadGuard } from './https-redirect-guard';",
    'function validatePublicHttpsUrl(value: string): URL {',
    '  const url = new URL(value);',
    "  if (url.protocol !== 'https:' || url.username || url.password || " +
      "isPrivateNetworkHost(url.hostname)) throw new Error('blocked');",
    '  return url;',
    '}',
    'export async function resolvePublicHttpsRedirect(address: URL, signal: AbortSignal,',
    '  ensureGuardInstalled: () => Promise<void> = ensurePublicHttpsHeadGuard) {',
    '  const target = validatePublicHttpsUrl(address.href);',
    '  await ensureGuardInstalled();',
    '  const response = await fetch(target.href, {',
    "    method: 'HEAD', credentials: 'omit', redirect: 'follow',",
    "    referrerPolicy: 'no-referrer', cache: 'no-store', signal,",
    '  });',
    '  const canonical = validatePublicHttpsUrl(response.url);',
    '  return canonical;',
    '}',
  ].join('\n');
}

function collectHead(source: string, ownerPath = HEAD_OWNER_PATH, requestPolicy = 'guarded-head') {
  const root = createTempRoot('network-head-policy-');
  policy(root, ownerPath, requestPolicy);
  const file = writeFile(root, ownerPath, source);
  return collectNetworkFetchPolicyViolations([file], { policyPath: POLICY_PATH, rootDir: root });
}

describe('guarded HEAD network fetch policy', () => {
  it('accepts the bounded anonymous HEAD resolver with its canonical imported default guard', () => {
    expect(collectHead(safeHeadSource())).toEqual([]);
  });

  it('accepts aliases for the canonical imported guard', () => {
    const source = safeHeadSource()
      .replace(
        'import { ensurePublicHttpsHeadGuard }',
        'import { ensurePublicHttpsHeadGuard as ensureHeadGuard }'
      )
      .replace('= ensurePublicHttpsHeadGuard)', '= ensureHeadGuard)');
    expect(collectHead(source)).toEqual([]);
  });

  it.each([
    ['raw target', (source: string) => source.replace('fetch(target.href', 'fetch(address.href')],
    [
      'validator parsing an unrelated URL',
      (source: string) => source.replace('new URL(value)', "new URL('https://example.com')"),
    ],
    [
      'validator returning unchecked input',
      (source: string) => source.replace('return url;', 'return value;'),
    ],
    [
      'non-HTTPS validator',
      (source: string) => source.replace("url.protocol !== 'https:' || ", ''),
    ],
    [
      'missing private host check',
      (source: string) => source.replace(' || isPrivateNetworkHost(url.hostname)', ''),
    ],
    [
      'untrusted private host validator',
      (source: string) =>
        source.replace('@sniptale/platform/security/private-network-host', './fake-private-host'),
    ],
    [
      'missing userinfo check',
      (source: string) => source.replace(' || url.username || url.password', ''),
    ],
    ['wrong method', (source: string) => source.replace("method: 'HEAD'", "method: 'GET'")],
    [
      'cookies',
      (source: string) => source.replace("credentials: 'omit'", "credentials: 'include'"),
    ],
    [
      'manual redirects',
      (source: string) => source.replace("redirect: 'follow'", "redirect: 'manual'"),
    ],
    [
      'referrer disclosure',
      (source: string) =>
        source.replace("referrerPolicy: 'no-referrer'", "referrerPolicy: 'origin'"),
    ],
    [
      'cache persistence',
      (source: string) => source.replace("cache: 'no-store'", "cache: 'default'"),
    ],
    [
      'missing signal',
      (source: string) => source.replace("cache: 'no-store', signal,", "cache: 'no-store',"),
    ],
    [
      'untyped signal',
      (source: string) => source.replace('signal: AbortSignal', 'signal: unknown'),
    ],
    [
      'detached signal',
      (source: string) =>
        source.replace("cache: 'no-store', signal,", "cache: 'no-store', signal: otherSignal,"),
    ],
    [
      'request override',
      (source: string) =>
        source.replace("cache: 'no-store', signal,", "cache: 'no-store', signal, ...overrides,"),
    ],
    [
      'missing default guard',
      (source: string) => source.replace(' = ensurePublicHttpsHeadGuard', ''),
    ],
    [
      'fake default guard',
      (source: string) => source.replace("from './https-redirect-guard'", "from './fake-guard'"),
    ],
    [
      'wrong imported guard',
      (source: string) => source.replaceAll('ensurePublicHttpsHeadGuard', 'ensureSomethingElse'),
    ],
    [
      'unawaited guard',
      (source: string) => source.replace('await ensureGuardInstalled()', 'ensureGuardInstalled()'),
    ],
    [
      'conditional guard',
      (source: string) =>
        source.replace('await ensureGuardInstalled()', 'if (false) await ensureGuardInstalled()'),
    ],
    [
      'guard after fetch',
      (source: string) =>
        source
          .replace('  await ensureGuardInstalled();\n', '')
          .replace('  const canonical', '  await ensureGuardInstalled();\n  const canonical'),
    ],
    [
      'nested guard',
      (source: string) =>
        source.replace(
          'await ensureGuardInstalled()',
          'await (async () => { await ensureGuardInstalled(); })()'
        ),
    ],
    [
      'missing final validation',
      (source: string) =>
        source.replace('validatePublicHttpsUrl(response.url)', 'new URL(response.url)'),
    ],
    [
      'validation of unrelated URL',
      (source: string) =>
        source.replace(
          'validatePublicHttpsUrl(response.url)',
          'validatePublicHttpsUrl(address.href)'
        ),
    ],
  ])('blocks %s', (_label, mutate) => {
    expect(collectHead(mutate(safeHeadSource()))).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'network-fetch-policy-missing' })])
    );
  });

  it('restricts the HEAD entitlement to the exact canonical owner', () => {
    expect(collectHead(safeHeadSource(), OWNER_PATH)).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'network-fetch-policy-missing' })])
    );
  });

  it('rejects unknown request policies instead of using the GET profile', () => {
    expect(collectHead(safeSource(), OWNER_PATH, 'unknown')).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'network-fetch-policy-missing' })])
    );
  });

  it('does not let the HEAD profile waive another fetch in the same owner', () => {
    const source = safeHeadSource().replace(
      '  return canonical;',
      '  await fetch(address.href);\n  return canonical;'
    );
    expect(
      collectHead(source).filter(({ rule }) => rule === 'network-fetch-policy-missing')
    ).toHaveLength(1);
  });
});
