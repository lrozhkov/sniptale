import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile, writeJson } from '../../test-support/test-helpers';

const inheritedProofAuthority = process.env.SNIPTALE_UNIT_PROOF_AUTHORITY;
const inheritedControlDigest = process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST;

beforeEach(() => {
  delete process.env.SNIPTALE_UNIT_PROOF_AUTHORITY;
  process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = `sha256:${'a'.repeat(64)}`;
});

afterEach(() => {
  delete process.env.SNIPTALE_QA_CPU_TOKENS;
  delete process.env.SNIPTALE_QA_MEMORY_MIB;
  if (inheritedProofAuthority == null) delete process.env.SNIPTALE_UNIT_PROOF_AUTHORITY;
  else process.env.SNIPTALE_UNIT_PROOF_AUTHORITY = inheritedProofAuthority;
  if (inheritedControlDigest == null) delete process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST;
  else process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = inheritedControlDigest;
});

it('rejects full-unit reuse across candidate control digests', async () => {
  const root = createProofRoot();
  await withCwd(root, async () => {
    const module = await import('./unit-test-proof.mjs');
    module.recordSuccessfulFullUnitProof({ cwd: root, maxWorkers: 2 });
    process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = `sha256:${'b'.repeat(64)}`;
    expect(module.resolveReusableFullUnitProof({ cwd: root, maxWorkers: 2 })).toMatchObject({
      matched: false,
      reason: 'full unit proof control digest changed',
    });
  });
});

function createProofRoot() {
  const root = createTempRoot('unit-proof-');
  writeFile(root, 'apps/extension/src/example.ts', 'export const value = 1;\n');
  writeFile(root, 'apps/extension/src/example.test.ts', 'export const testValue = 1;\n');
  writeFile(root, 'packages/foundation/src/value.ts', 'export const packageValue = 1;\n');
  writeFile(root, 'tooling/qa/guards/quality/runner.mjs', 'export const runner = 1;\n');
  writeFile(root, 'tooling/qa/guards/quality/runner.test.ts', 'export const harnessTest = 1;\n');
  writeFile(root, 'tooling/ci/unrelated.mjs', 'export const ci = 1;\n');
  writeFile(root, 'tooling/test/unrelated.mjs', 'export const testTool = 1;\n');
  writeFile(root, 'tooling/test/harness/product-helper.ts', 'export const helper = 1;\n');
  writeFile(root, 'tooling/test/support/product-fixture.ts', 'export const fixture = 1;\n');
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.node.json']) {
    writeJson(root, file, {});
  }
  writeFile(root, 'vitest.config.ts', 'export default {};\n');
  writeFile(root, 'tooling/test/harness/vitest.setup.ts', 'export {};\n');
  writeJson(root, 'tooling/configs/qa/unit-proof-reuse.data.json', {
    schemaVersion: 1,
    artifactKind: 'sniptale-unit-proof-reuse-policy',
    proofPath: '.tmp/qa/unit-proof.json',
    owners: {
      decision: 'tooling/qa/proof/unit/unit-test-proof.mjs',
      execution: 'tooling/qa/composition/repository/full-verification/unit-test-steps.mjs',
      ciTransport: 'tooling/ci/proof-host-inputs.mjs',
      ciMount: 'tooling/ci/proof-host-inputs.mjs',
      artifactSeal: 'tooling/ci/proof-artifact-seal.mjs',
    },
    inputRoots: ['apps/extension', 'packages'],
    testSupportRoots: ['tooling/test/harness', 'tooling/test/support'],
    runnerRoots: ['tooling/qa'],
    configFiles: [
      'package.json',
      'package-lock.json',
      'vitest.config.ts',
      'tsconfig.json',
      'tsconfig.node.json',
      'tooling/test/harness/vitest.setup.ts',
      'tooling/configs/qa/unit-proof-reuse.data.json',
    ],
    excludedDirectoryNames: ['.git', '.tmp', 'build', 'dist', 'node_modules'],
    consumers: ['tooling/qa/composition/repository/full-verification/unit-test-steps.mjs'],
    modes: { local: 'local', candidate: 'external' },
    digests: ['inputs'],
    proof: 'passed full suite',
    rollback: 'delete receipt',
    collisionCheck: 'atomic canonical path',
  });
  return root;
}

it('reuses a sealed full-suite proof for the exact product, runner, and execution inputs', async () => {
  const root = createProofRoot();
  const result = await withCwd(root, async () => {
    const module = await import('./unit-test-proof.mjs');
    const proof = module.recordSuccessfulFullUnitProof({
      cwd: root,
      maxWorkers: 2,
      source: 'ci:release',
    });
    return {
      proof,
      reused: module.resolveReusableFullUnitProof({ cwd: root, maxWorkers: 2 }),
    };
  });

  expect(result.proof.testFiles).toEqual(['apps/extension/src/example.test.ts']);
  expect(result.proof.fileDigests.some(({ file }) => file.endsWith('runner.test.ts'))).toBe(false);
  expect(result.reused).toMatchObject({ matched: true, source: 'local proof' });
});

it('invalidates for nested QA runner changes but excludes tests and unrelated tooling roots', async () => {
  const root = createProofRoot();
  await withCwd(root, async () => {
    const module = await import('./unit-test-proof.mjs');
    const initial = module.createFullUnitProofInputs({ cwd: root, maxWorkers: 2 });
    expect(initial.fileDigests.map(({ file }) => file)).toContain(
      'tooling/qa/guards/quality/runner.mjs'
    );
    expect(initial.fileDigests.map(({ file }) => file)).not.toEqual(
      expect.arrayContaining([
        'tooling/qa/guards/quality/runner.test.ts',
        'tooling/ci/unrelated.mjs',
        'tooling/test/unrelated.mjs',
      ])
    );

    writeFile(root, 'tooling/qa/guards/quality/runner.mjs', 'export const runner = 2;\n');
    const changed = module.createFullUnitProofInputs({ cwd: root, maxWorkers: 2 });
    expect(changed.inputDigest).not.toBe(initial.inputDigest);
  });
});

it('rejects overlapping runner roots and symlinked QA inputs', async () => {
  const overlappingRoot = createProofRoot();
  const policyPath = path.join(overlappingRoot, 'tooling/configs/qa/unit-proof-reuse.data.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  policy.runnerRoots = ['tooling/qa', 'tooling/qa/guards'];
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  await withCwd(overlappingRoot, async () => {
    const module = await import('./unit-test-proof.mjs');
    expect(() => module.createFullUnitProofInputs({ cwd: overlappingRoot })).toThrow(
      'Unit proof input roots overlap.'
    );
  });

  const symlinkRoot = createProofRoot();
  fs.symlinkSync(
    path.join(symlinkRoot, 'tooling/ci/unrelated.mjs'),
    path.join(symlinkRoot, 'tooling/qa/guards/quality/symlink.mjs')
  );
  await withCwd(symlinkRoot, async () => {
    const module = await import('./unit-test-proof.mjs');
    expect(() => module.createFullUnitProofInputs({ cwd: symlinkRoot })).toThrow(
      'Unit proof input may not be a symlink'
    );
  });
});

it('rejects a configured unit input root that does not exist', async () => {
  const root = createProofRoot();
  const policyPath = path.join(root, 'tooling/configs/qa/unit-proof-reuse.data.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  policy.inputRoots.push('missing-product-root');
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);

  await withCwd(root, async () => {
    const module = await import('./unit-test-proof.mjs');
    expect(() => module.createFullUnitProofInputs({ cwd: root })).toThrow(
      'Unit proof input root is missing: missing-product-root'
    );
  });
});

it('invalidates full-suite proof when product, test config, or receipt bytes drift', async () => {
  const root = createProofRoot();
  await withCwd(root, async () => {
    const module = await import('./unit-test-proof.mjs');
    module.recordSuccessfulFullUnitProof({ cwd: root, maxWorkers: 2 });
    writeFile(root, 'apps/extension/src/example.ts', 'export const value = 2;\n');
    expect(module.resolveReusableFullUnitProof({ cwd: root, maxWorkers: 2 })).toMatchObject({
      matched: false,
      reason: 'full unit proof inputs changed',
    });
    writeFile(root, 'apps/extension/src/example.ts', 'export const value = 1;\n');
    expect(module.resolveReusableFullUnitProof({ cwd: root, maxWorkers: 3 })).toMatchObject({
      matched: true,
    });
    fs.appendFileSync(path.join(root, '.tmp/qa/unit-proof.json'), 'corrupt');
    expect(module.resolveReusableFullUnitProof({ cwd: root, maxWorkers: 2 })).toMatchObject({
      matched: false,
    });
  });
});

it('records resource planning without changing semantic unit proof inputs', async () => {
  const root = createProofRoot();
  await withCwd(root, async () => {
    const module = await import('./unit-test-proof.mjs');
    process.env.SNIPTALE_QA_CPU_TOKENS = '24';
    process.env.SNIPTALE_QA_MEMORY_MIB = '24576';
    const first = module.createFullUnitProofInputs({ cwd: root, maxWorkers: 12 });
    process.env.SNIPTALE_QA_CPU_TOKENS = '16';
    process.env.SNIPTALE_QA_MEMORY_MIB = '16384';
    const second = module.createFullUnitProofInputs({ cwd: root, maxWorkers: 6 });

    expect(second.inputDigest).toBe(first.inputDigest);
    expect(second.planning).not.toEqual(first.planning);
  });
});

it('invalidates full-suite proof when harness or shared product-test support changes', async () => {
  const root = createProofRoot();
  await withCwd(root, async () => {
    const module = await import('./unit-test-proof.mjs');
    module.recordSuccessfulFullUnitProof({ cwd: root, maxWorkers: 2 });
    writeFile(root, 'tooling/test/harness/product-helper.ts', 'export const helper = 2;\n');
    expect(module.resolveReusableFullUnitProof({ cwd: root, maxWorkers: 2 })).toMatchObject({
      matched: false,
      reason: 'full unit proof inputs changed',
    });
    writeFile(root, 'tooling/test/harness/product-helper.ts', 'export const helper = 1;\n');
    writeFile(root, 'tooling/test/support/product-fixture.ts', 'export const fixture = 2;\n');
    expect(module.resolveReusableFullUnitProof({ cwd: root, maxWorkers: 2 })).toMatchObject({
      matched: false,
      reason: 'full unit proof inputs changed',
    });
  });
});

it('ignores workspace-local receipts for candidate external-only authority', async () => {
  const root = createProofRoot();
  await withCwd(root, async () => {
    const module = await import('./unit-test-proof.mjs');
    module.recordSuccessfulFullUnitProof({ cwd: root, maxWorkers: 2 });
    const previous = process.env.SNIPTALE_UNIT_PROOF_AUTHORITY;
    process.env.SNIPTALE_UNIT_PROOF_AUTHORITY = 'external-only';
    try {
      expect(module.resolveReusableFullUnitProof({ cwd: root, maxWorkers: 2 })).toEqual({
        matched: false,
        reason: 'no admissible full unit proof',
      });
    } finally {
      if (previous == null) delete process.env.SNIPTALE_UNIT_PROOF_AUTHORITY;
      else process.env.SNIPTALE_UNIT_PROOF_AUTHORITY = previous;
    }
  });
});
