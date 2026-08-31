import { describe, expect, it } from 'vitest';

import { createTempRoot, writeJson, writeFile } from '../../test-support/test-helpers';
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

function verifyCanonicalSecretTaxonomyAcrossSessionStorage() {
  for (const key of ['apiKey', 'token', 'secret', 'authorization', 'cookie']) {
    const root = createTempRoot(`verify-secret-storage-${key}-`);
    const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
    writeEmptySecurityPolicy(root, policyPath);
    const file = writeFile(
      root,
      'apps/extension/src/settings/example.ts',
      `await chrome.storage.session.set({ ${key}: value });\n`
    );
    expect(collectSecretStorageViolations([file], { policyPath, rootDir: root })).toEqual([
      expect.objectContaining({ rule: 'secret-storage-outside-owner' }),
    ]);
  }
}

function verifyExactSecretStorageOwnerPolicy() {
  const root = createTempRoot('verify-secret-storage-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeJson(root, policyPath, {
    secretStorageOwners: [
      {
        file: 'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
        owner: 'shared-ai-storage',
        justification: 'Canonical encrypted secret storage owner.',
        reviewNote: 'Plaintext credentials stay forbidden outside this file.',
        storageWrites: [
          {
            sink: 'browserStorage.local.set',
            keys: ['AI_PROVIDER_SECRETS_KEY'],
          },
        ],
      },
    ],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [],
  });

  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
    [
      'export async function persist(encryptedEnvelope) {',
      '  await browserStorage.local.set({ [AI_PROVIDER_SECRETS_KEY]: encryptedEnvelope });',
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

  const forbiddenRoot = createTempRoot('verify-secret-storage-owner-forbidden-');
  writeJson(forbiddenRoot, policyPath, {
    secretStorageOwners: [
      {
        file: 'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
        owner: 'shared-ai-storage',
        justification: 'Canonical encrypted secret storage owner.',
        reviewNote: 'Plaintext credentials stay forbidden outside this file.',
        storageWrites: [
          {
            sink: 'browserStorage.local.set',
            keys: ['AI_PROVIDER_SECRETS_KEY'],
          },
        ],
      },
    ],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [],
  });
  const forbiddenFile = writeFile(
    forbiddenRoot,
    'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
    'await browserStorage.local.set({ apiKey: plaintext });\n'
  );
  expect(
    collectSecretStorageViolations([forbiddenFile], {
      policyPath,
      rootDir: forbiddenRoot,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'secret-storage-outside-owner',
      file: 'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
    }),
  ]);
}

function verifySinkBoundInspection() {
  const root = createTempRoot('verify-secret-storage-sink-bound-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/settings/example.ts',
    [
      'const credentials = { apiKey: plaintext };',
      'export async function persist(theme) {',
      '  await browserStorage.local.set({ theme });',
      '}',
      '',
    ].join('\n')
  );
  expect(collectSecretStorageViolations([file], { policyPath, rootDir: root })).toEqual([]);
}

function verifyResolvedPayloadInspection() {
  const root = createTempRoot('verify-secret-storage-resolved-payload-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/settings/example.ts',
    [
      'const persisted = { settings: { apiKey: plaintext } };',
      'export async function persist() {',
      '  await browserStorage.local.set(persisted);',
      '}',
      '',
    ].join('\n')
  );
  expect(collectSecretStorageViolations([file], { policyPath, rootDir: root })).toEqual([
    expect.objectContaining({ rule: 'secret-storage-outside-owner' }),
  ]);
}

function verifyDuplicatePolicyTargetViolation() {
  const root = createTempRoot('verify-secret-storage-duplicate-policy-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  const ownerEntry = {
    file: 'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
    owner: 'shared-ai-storage',
    justification: 'Canonical encrypted secret storage owner.',
    reviewNote: 'Plaintext credentials stay forbidden outside this file.',
    storageWrites: [],
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
  it(
    'enforces exact sink/key policy inside the encrypted secret owner',
    verifyExactSecretStorageOwnerPolicy
  );
  it(
    'normalizes the canonical secret taxonomy and includes session storage',
    verifyCanonicalSecretTaxonomyAcrossSessionStorage
  );
  it('ignores secret-shaped values outside the storage sink payload', verifySinkBoundInspection);
  it(
    'resolves a storage payload declared outside the calling function',
    verifyResolvedPayloadInspection
  );
  it('flags duplicated policy target entries', verifyDuplicatePolicyTargetViolation);
});
