import { describe, expect, it } from 'vitest';

import { createTempRoot, writeFile, writeJson } from '../../../test-support/test-helpers';
import { collectNetworkFetchPolicyViolations } from './verify-network-fetch-policy.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-network-ownership.data.json';
const OWNER_PATH = 'apps/extension/src/background/capture/routing/web-snapshot/fetch.ts';

function policy(root: string, ownerPath = OWNER_PATH) {
  writeJson(root, POLICY_PATH, {
    anonymousPublicFetchOwners: [
      {
        file: ownerPath,
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
