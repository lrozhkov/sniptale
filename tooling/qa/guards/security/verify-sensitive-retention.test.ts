import { describe, expect, it } from 'vitest';

import { createTempRoot, writeJson, writeFile } from '../../core/test-helpers';
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
});
