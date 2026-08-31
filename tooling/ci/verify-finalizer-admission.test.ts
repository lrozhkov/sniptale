import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/test-support/test-helpers';
import { verifyFinalizerAdmission } from './verify-finalizer-admission.mjs';

const expected = {
  repository: 'lrozhkov/sniptale',
  releaseCommit: 'a'.repeat(40),
  controlCommit: 'b'.repeat(40),
  finalizerRunId: '42',
};

function fixture(overrides = {}) {
  const root = createTempRoot('finalizer-admission-');
  const file = path.join(root, 'finalizer-admission.json');
  writeFile(
    root,
    'finalizer-admission.json',
    `${JSON.stringify({
      schemaVersion: 1,
      artifactKind: 'sniptale-release-finalizer-admission',
      classification: 'post-proof-only',
      ...expected,
      sourceProofRunId: '40',
      sourceProofRunAttempt: '1',
      images: {
        qa: `sha256:${'c'.repeat(64)}`,
        controller: `sha256:${'d'.repeat(64)}`,
      },
      ...overrides,
    })}\n`
  );
  return file;
}

it('admits the exact release, control, proof-run, and image binding', () => {
  expect(verifyFinalizerAdmission(fixture(), expected)).toMatchObject({
    sourceProofRunId: '40',
    releaseCommit: expected.releaseCommit,
  });
});

it('rejects detached control and image identities', () => {
  expect(() =>
    verifyFinalizerAdmission(fixture({ controlCommit: 'e'.repeat(40) }), expected)
  ).toThrow('identity is invalid');
  expect(() => verifyFinalizerAdmission(fixture({ images: { qa: 'bad' } }), expected)).toThrow(
    'identity is invalid'
  );
});
