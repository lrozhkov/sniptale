import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile } from '../qa/test-support/test-helpers';
import { findLocalFastProofRoot } from './local-fast-proof-admission.mjs';

it('discovers the exact locked-container proof produced for the local workspace tree', async () => {
  const root = createTempRoot('local-fast-proof-discovery-');
  writeFile(
    root,
    'build/ci-artifacts/proof-1/proof-manifest.json',
    `${JSON.stringify({
      lane: 'proof',
      status: 'passed',
      candidateTree: 'candidate-tree',
      workspaceMode: 'local-workspace',
      executionEnvironment: { kind: 'locked-container', digest: `sha256:${'a'.repeat(64)}` },
    })}\n`
  );

  await withCwd(root, () => {
    expect(
      findLocalFastProofRoot({
        candidateTree: 'candidate-tree',
        executionEnvironmentKind: 'locked-container',
      })
    ).toBe(path.join(root, 'build/ci-artifacts/proof-1'));
  });
});
