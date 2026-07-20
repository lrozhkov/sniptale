import { describe, expect, it } from 'vitest';

import { createTempRoot, writeJson, writeFile } from '../../core/test-helpers';
import { collectSecretStorageViolations } from './verify-secret-storage.mjs';

function writeEmptySecurityPolicy(root: string, policyPath: string) {
  writeJson(root, policyPath, {
    secretStorageOwners: [],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [],
  });
}

function verifySecretStorageViolation() {
  const root = createTempRoot('verify-secret-storage-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);

  const file = writeFile(
    root,
    'apps/extension/src/settings/example.ts',
    [
      'export async function persist(apiKey) {',
      '  const settings = { apiKey };',
      '  await browserStorage.local.set({ settings });',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectSecretStorageViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'secret-storage-outside-owner',
      file: 'apps/extension/src/settings/example.ts',
    }),
  ]);
}

function verifySecretStorageOwnerAllowlist() {
  const root = createTempRoot('verify-secret-storage-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeJson(root, policyPath, {
    secretStorageOwners: [
      {
        file: 'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
        owner: 'shared-ai-storage',
        justification: 'Canonical encrypted secret storage owner.',
        reviewNote: 'Plaintext credentials stay forbidden outside this file.',
      },
    ],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [],
  });

  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
    [
      'export async function persist(apiKey) {',
      '  const payload = { apiKey };',
      '  await browserStorage.local.set({ payload });',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectSecretStorageViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([]);
}

function verifyDuplicatePolicyTargetViolation() {
  const root = createTempRoot('verify-secret-storage-duplicate-policy-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  const ownerEntry = {
    file: 'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
    owner: 'shared-ai-storage',
    justification: 'Canonical encrypted secret storage owner.',
    reviewNote: 'Plaintext credentials stay forbidden outside this file.',
  };
  writeJson(root, policyPath, {
    secretStorageOwners: [ownerEntry, ownerEntry],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [],
  });
  const file = writeFile(
    root,
    'src/settings/example.ts',
    'export async function persist() { await browserStorage.local.set({ ok: true }); }\n'
  );
  writeFile(
    root,
    'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
    'export const owner = true;\n'
  );

  expect(
    collectSecretStorageViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'security-policy-secret-storage-duplicate-target',
      file: policyPath,
    }),
  ]);
}

describe('verify-secret-storage', () => {
  it(
    'flags browser storage writes that retain plaintext secret fields outside the secret owner',
    verifySecretStorageViolation
  );
  it('allows the explicit encrypted secret owner seam', verifySecretStorageOwnerAllowlist);
  it('flags duplicated policy target entries', verifyDuplicatePolicyTargetViolation);
});
