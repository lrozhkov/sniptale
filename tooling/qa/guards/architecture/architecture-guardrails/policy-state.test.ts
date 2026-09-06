import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  withCwd,
  writeFile,
  writeJson,
} from '../../../test-support/test-helpers';

async function loadModule(root: string) {
  return withCwd(root, async () =>
    importFresh<typeof import('./check.mjs')>('./check.mjs', import.meta.url)
  );
}

function writeRuntimeTopology(root: string) {
  const runtimeDefaults = { entrypointFiles: [] };
  writeJson(root, 'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json', [
    { ...runtimeDefaults, id: 'background', root: 'apps/extension/src/background' },
  ]);
  writeJson(root, 'package.json', { name: 'policy-state-guardrails-temp', type: 'module' });
}

function writePolicyStateRegistry(root: string) {
  writeFile(
    root,
    'apps/extension/src/background/routing-contracts/policy-state/registry.ts',
    "export const policyStateRegistry = [{ id: 'content-action-runtime-tokens' }];\n"
  );
}

it('blocks new authority state files without policy-state ids', async () => {
  const root = createTempRoot('architecture-guardrails-policy-state-');
  writeRuntimeTopology(root);
  writePolicyStateRegistry(root);
  writeFile(
    root,
    'apps/extension/src/background/new-owner/session-capability.ts',
    [
      'const createPrivilegedSyncMemoryDomain = () => ({ clear() {} });',
      'const sessions = createPrivilegedSyncMemoryDomain("new.sessions");',
      'export function resetSessionsForTests() { sessions.clear(); }',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/background/application/policy-state/session-capability.ts',
    [
      'const createPrivilegedSyncMemoryDomain = () => ({ clear() {} });',
      'const sessions = createPrivilegedSyncMemoryDomain("application.sessions");',
      'export function resetSessionsForTests() { sessions.clear(); }',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/background/legacy/session-capability.ts',
    'const sessions = new Map();\n'
  );

  const module = await loadModule(root);

  expect(
    module.collectPolicyStateDescriptorViolations(
      [
        'apps/extension/src/background/application/policy-state/session-capability.ts',
        'apps/extension/src/background/new-owner/session-capability.ts',
        'apps/extension/src/background/legacy/session-capability.ts',
      ],
      {
        newFiles: new Set([
          'apps/extension/src/background/application/policy-state/session-capability.ts',
          'apps/extension/src/background/new-owner/session-capability.ts',
        ]),
        root,
      }
    )
  ).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/background/application/policy-state/session-capability.ts',
      rule: 'policy-state-descriptor-required',
    }),
    expect.objectContaining({
      file: 'apps/extension/src/background/new-owner/session-capability.ts',
      rule: 'policy-state-descriptor-required',
    }),
  ]);
});

it('reports policy-state ids that are not declared in the registry', async () => {
  const root = createTempRoot('architecture-guardrails-policy-state-unknown-');
  writeRuntimeTopology(root);
  writePolicyStateRegistry(root);
  writeFile(
    root,
    'apps/extension/src/background/new-owner/session-capability.ts',
    [
      'export const route = {',
      "  policyStateIds: ['content-action-runtime-tokens', 'missing-policy-state'],",
      '};',
    ].join('\n')
  );

  const module = await loadModule(root);

  expect(
    module.collectPolicyStateDescriptorViolations(
      ['apps/extension/src/background/new-owner/session-capability.ts'],
      {
        newFiles: new Set(['apps/extension/src/background/new-owner/session-capability.ts']),
        root,
      }
    )
  ).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/background/new-owner/session-capability.ts',
      message: expect.stringContaining('missing-policy-state'),
      rule: 'unknown-policy-state-id',
    }),
  ]);
});

it('fails closed when the policy-state registry is missing', async () => {
  const root = createTempRoot('architecture-guardrails-policy-state-missing-');
  writeRuntimeTopology(root);
  writeFile(
    root,
    'apps/extension/src/background/new-owner/session-capability.ts',
    "export const route = { policyStateId: 'missing-policy-state' };\n"
  );

  const module = await loadModule(root);

  expect(
    module.collectPolicyStateDescriptorViolations(
      ['apps/extension/src/background/new-owner/session-capability.ts'],
      { root }
    )
  ).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/background/routing-contracts/policy-state/registry.ts',
      rule: 'policy-state-registry-missing',
    }),
  ]);
});

it('ignores id-shaped comments and reads descriptor ids structurally', async () => {
  const root = createTempRoot('architecture-guardrails-policy-state-structural-');
  writeRuntimeTopology(root);
  writeFile(
    root,
    'apps/extension/src/background/routing-contracts/policy-state/registry.ts',
    [
      "// id: 'comment-only-id'",
      "export const policyStateRegistry = [{ id: 'content-action-runtime-tokens' }];",
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/background/new-owner/session-capability.ts',
    "export const route = { policyStateIds: ['content-action-runtime-tokens', 'comment-only-id'] };\n"
  );

  const module = await loadModule(root);
  expect(
    module.collectPolicyStateDescriptorViolations(
      ['apps/extension/src/background/new-owner/session-capability.ts'],
      { root }
    )
  ).toEqual([expect.objectContaining({ rule: 'unknown-policy-state-id' })]);
});

it('accepts policy-bound privileged capability stores with declared policy ids', async () => {
  const root = createTempRoot('architecture-guardrails-policy-state-policy-id-');
  writeRuntimeTopology(root);
  writePolicyStateRegistry(root);
  writeFile(
    root,
    'apps/extension/src/background/new-owner/session-capability.ts',
    [
      'export const sessions = createPrivilegedCapabilityStore({',
      "  domain: 'new.sessions',",
      "  policyId: 'content-action-runtime-tokens',",
      "  storageClass: 'memory-only',",
      '});',
    ].join('\n')
  );

  const module = await loadModule(root);

  expect(
    module.collectPolicyStateDescriptorViolations(
      ['apps/extension/src/background/new-owner/session-capability.ts'],
      {
        newFiles: new Set(['apps/extension/src/background/new-owner/session-capability.ts']),
        root,
      }
    )
  ).toEqual([]);
});
