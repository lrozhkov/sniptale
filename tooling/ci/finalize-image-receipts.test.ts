import crypto from 'node:crypto';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/test-support/test-helpers';
import { verifyFinalizerImageReceipts } from './finalize-image-receipts.mjs';

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = createTempRoot('finalizer-images-');
  const identity = {
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    runId: '42',
    runAttempt: '3',
  };
  for (const [directory, digest] of [
    ['candidate-image', `sha256:${'c'.repeat(64)}`],
    ['controller-image', `sha256:${'d'.repeat(64)}`],
  ]) {
    writeFile(
      root,
      path.join(directory, 'use-receipt.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        artifactKind: 'sniptale-candidate-image-use',
        cacheKey: 'e'.repeat(64),
        candidateTreeDigest: hash(`git-tree:${identity.tree}`),
        candidateCommitDigest: hash(`git-commit:${identity.commit}`),
        imageInputDigest: 'f'.repeat(64),
        platform: 'linux/amd64',
        forced: false,
        forceReasonDigest: null,
        digest,
        workflowRunId: identity.runId,
        workflowRunAttempt: identity.runAttempt,
        verified: true,
      })}\n`
    );
  }
  return { identity, root };
}

it('binds both verified image receipts to the canonical commit, tree, and run attempt', () => {
  const value = fixture();
  expect(verifyFinalizerImageReceipts(value.root, value.identity)).toEqual({
    qaDigest: `sha256:${'c'.repeat(64)}`,
    controllerDigest: `sha256:${'d'.repeat(64)}`,
  });
});

it('rejects a receipt detached from the admitted run', () => {
  const value = fixture();
  expect(() =>
    verifyFinalizerImageReceipts(value.root, { ...value.identity, runId: '43' })
  ).toThrow('does not match');
});
