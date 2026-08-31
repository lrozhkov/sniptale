import { describe, expect, it } from 'vitest';

import { createTempRoot, writeJson, writeFile } from '../../test-support/test-helpers';
import { collectSensitiveRetentionViolations } from './verify-sensitive-retention.mjs';

function writeEmptySecurityPolicy(root: string, policyPath: string) {
  writeJson(root, policyPath, {
    secretStorageOwners: [],
    sensitiveRetentionOwners: [],
    diagnosticSanitizerOwners: [],
  });
}

function verifySensitiveRetentionViolation() {
  const root = createTempRoot('verify-sensitive-retention-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);

  const file = writeFile(
    root,
    'apps/extension/src/background/history.ts',
    [
      'export async function save(prompt, rawResponse) {',
      '  const entry = { prompt, rawResponse };',
      '  await browserStorage.local.set({ llm_request_history: [entry] });',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectSensitiveRetentionViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'sensitive-retention-outside-owner',
      file: 'apps/extension/src/background/history.ts',
    }),
  ]);
}

function verifySessionStorageRetentionViolation() {
  const root = createTempRoot('verify-sensitive-retention-session-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);

  const file = writeFile(
    root,
    'apps/extension/src/background/history.ts',
    [
      'export async function save(prompt, markdownData) {',
      '  await browserStorage.session.set({ history: [{ prompt, markdownData }] });',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectSensitiveRetentionViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'sensitive-retention-outside-owner',
      file: 'apps/extension/src/background/history.ts',
    }),
  ]);
}

function verifyMetadataOnlyRetention() {
  const root = createTempRoot('verify-sensitive-retention-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);

  const file = writeFile(
    root,
    'apps/extension/src/background/history.ts',
    [
      'export async function save(nodesCount, resultCount) {',
      '  const entry = { nodesCount, resultCount, requestKind: "json", status: "success" };',
      '  await browserStorage.local.set({ llm_request_history: [entry] });',
      '}',
      '',
    ].join('\n')
  );

  expect(
    collectSensitiveRetentionViolations([file], {
      policyPath,
      rootDir: root,
    })
  ).toEqual([]);
}

function verifyIndexedDbPreviewRetentionViolation() {
  const root = createTempRoot('verify-sensitive-retention-indexed-db-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/video-preview-cache/unowned.ts',
    [
      'export async function commit(transaction, record: VideoPreviewCacheRecord) {',
      '  const segments = record.segments;',
      '  await transaction.putRecord(record.storageKey, { ...record, segments });',
      '}',
      '',
    ].join('\n')
  );

  expect(collectSensitiveRetentionViolations([file], { policyPath, rootDir: root })).toEqual([
    expect.objectContaining({
      file: 'apps/extension/src/composition/persistence/video-preview-cache/unowned.ts',
      rule: 'sensitive-retention-outside-owner',
    }),
  ]);
}

function verifySinkBoundRetentionInspection() {
  const root = createTempRoot('verify-sensitive-retention-sink-bound-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/background/history.ts',
    [
      'const response = { prompt, rawResponse };',
      'export async function save(theme) {',
      '  await browserStorage.local.set({ theme });',
      '}',
      '',
    ].join('\n')
  );
  expect(collectSensitiveRetentionViolations([file], { policyPath, rootDir: root })).toEqual([]);
}

function verifyResolvedRetentionPayloadInspection() {
  const root = createTempRoot('verify-sensitive-retention-resolved-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  writeEmptySecurityPolicy(root, policyPath);
  const file = writeFile(
    root,
    'apps/extension/src/background/history.ts',
    [
      'const persisted = { history: [{ prompt, rawResponse }] };',
      'export async function save() {',
      '  await browserStorage.local.set(persisted);',
      '}',
      '',
    ].join('\n')
  );
  expect(collectSensitiveRetentionViolations([file], { policyPath, rootDir: root })).toEqual([
    expect.objectContaining({ rule: 'sensitive-retention-outside-owner' }),
  ]);
}

function verifyExactRetentionOwnerPolicy() {
  const root = createTempRoot('verify-sensitive-retention-owner-');
  const policyPath = 'tooling/configs/qa/security-storage-ownership.data.json';
  const ownerFile = 'apps/extension/src/composition/persistence/gallery-saved-views/index.ts';
  writeJson(root, policyPath, {
    secretStorageOwners: [],
    sensitiveRetentionOwners: [
      {
        file: ownerFile,
        owner: 'gallery-saved-views',
        justification: 'Canonical bounded saved-view owner.',
        reviewNote: 'Only the exact local saved-view key is admitted.',
        storageWrites: [
          {
            sink: 'browserStorage.local.set',
            keys: ['GALLERY_SAVED_VIEWS_STORAGE_KEY'],
          },
        ],
      },
    ],
    diagnosticSanitizerOwners: [],
  });
  const file = writeFile(
    root,
    ownerFile,
    'await browserStorage.local.set({ [GALLERY_SAVED_VIEWS_STORAGE_KEY]: gallerySavedViews });\n'
  );
  expect(collectSensitiveRetentionViolations([file], { policyPath, rootDir: root })).toEqual([]);

  const forbiddenRoot = createTempRoot('verify-sensitive-retention-owner-forbidden-');
  writeJson(forbiddenRoot, policyPath, {
    secretStorageOwners: [],
    sensitiveRetentionOwners: [
      {
        file: ownerFile,
        owner: 'gallery-saved-views',
        justification: 'Canonical bounded saved-view owner.',
        reviewNote: 'Only the exact local saved-view key is admitted.',
        storageWrites: [
          {
            sink: 'browserStorage.local.set',
            keys: ['GALLERY_SAVED_VIEWS_STORAGE_KEY'],
          },
        ],
      },
    ],
    diagnosticSanitizerOwners: [],
  });
  const forbiddenFile = writeFile(
    forbiddenRoot,
    ownerFile,
    'await browserStorage.local.set({ history: [{ prompt, rawResponse }] });\n'
  );
  expect(
    collectSensitiveRetentionViolations([forbiddenFile], {
      policyPath,
      rootDir: forbiddenRoot,
    })
  ).toEqual([expect.objectContaining({ rule: 'sensitive-retention-outside-owner' })]);
}

describe('verify-sensitive-retention', () => {
  it(
    'flags persistent prompt/content retention in browser storage',
    verifySensitiveRetentionViolation
  );
  it(
    'flags session storage retention of prompt/content payloads',
    verifySessionStorageRetentionViolation
  );
  it('allows metadata-only storage writes', verifyMetadataOnlyRetention);
  it(
    'flags derived-video IndexedDB writes outside the exact owner',
    verifyIndexedDbPreviewRetentionViolation
  );
  it(
    'ignores retention-shaped values outside the storage sink payload',
    verifySinkBoundRetentionInspection
  );
  it(
    'resolves a retention payload declared outside the calling function',
    verifyResolvedRetentionPayloadInspection
  );
  it('enforces exact sink/key policy inside a retention owner', verifyExactRetentionOwnerPolicy);
});
