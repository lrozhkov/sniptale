import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/core/test-helpers';
import { resolveReusableCodeqlProofHostPaths } from './codeql-proof-host.mjs';

it('admits CodeQL reuse only when both host inputs are regular non-symlink files', () => {
  const root = createTempRoot('codeql-proof-host-');
  const proof = writeFile(root, 'proof.json', '{}\n');
  const sarif = writeFile(root, 'results.sarif', '{}\n');
  const link = path.join(root, 'proof-link.json');
  fs.symlinkSync(proof, link);

  expect(resolveReusableCodeqlProofHostPaths({ proofPath: proof, sarifPath: sarif })).toEqual({
    proof,
    sarif,
  });
  expect(resolveReusableCodeqlProofHostPaths({ proofPath: link, sarifPath: sarif })).toBeNull();
  expect(resolveReusableCodeqlProofHostPaths({ proofPath: proof, sarifPath: root })).toBeNull();
  expect(resolveReusableCodeqlProofHostPaths({ proofPath: proof })).toBeNull();
});
