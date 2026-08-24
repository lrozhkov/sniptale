import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { generateCodeqlConfig } from '../codeql/config.mjs';
import { runCodeqlCheck } from '../audits/codeql.mjs';
import { createTempRoot, writeFile } from './test-helpers';

const proofEnvironmentKeys = [
  'SNIPTALE_CI_CONTAINER_DIGEST',
  'SNIPTALE_TRUSTED_CI_ROOT',
  'SNIPTALE_CODEQL_PROOF_PATH',
  'SNIPTALE_CODEQL_SARIF_PATH',
  'SNIPTALE_CODEQL_PROOF_AUTHORITY',
  'SNIPTALE_CANDIDATE_CONTROL_DIGEST',
] as const;
const originalProofEnvironment = new Map(
  proofEnvironmentKeys.map((key) => [key, process.env[key]])
);

beforeEach(() => {
  for (const key of proofEnvironmentKeys) delete process.env[key];
  process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = `sha256:${'a'.repeat(64)}`;
});

it('rejects CodeQL reuse across candidate control digests', async () => {
  const { root, sarifPath } = createPolicyRoot();
  const module = await import('./codeql-proof.mjs');
  module.recordSuccessfulCodeqlProof({ cwd: root, sarifPath });
  process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = `sha256:${'b'.repeat(64)}`;
  expect(module.resolveReusableCodeqlProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'CodeQL proof control digest changed',
  });
});

afterEach(() => {
  for (const key of proofEnvironmentKeys) {
    const original = originalProofEnvironment.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

function createPolicyRoot() {
  const root = createTempRoot('codeql-proof-');
  const policy = {
    schemaVersion: 1,
    artifactKind: 'sniptale-codeql-proof-reuse-policy',
    proofPath: '.tmp/qa/codeql-proof.json',
    sarifPath: '.tmp/codeql/results.filtered.sarif',
    configPath: 'tooling/configs/qa/codeql-config.yml',
    baselinePath: 'tooling/configs/qa/codeql-baseline.json',
    sourceRoots: ['src', 'apps', 'packages', 'tooling/ci', 'tooling/release'],
    sourceExtensions: ['.js', '.mjs', '.ts', '.tsx'],
    excludedDirectoryNames: ['fixtures', 'generated', 'test'],
    excludedFileMarkers: ['.data.', '.generated.', '.spec.', '.test.'],
    queryRoots: ['tooling/qa/codeql/lib', 'tooling/qa/codeql/queries'],
    controlFiles: [
      'tooling/configs/ci/toolchain.lock.json',
      'tooling/configs/qa/codeql-baseline.json',
      'tooling/configs/qa/codeql-config.yml',
      'tooling/configs/qa/codeql-proof-reuse.data.json',
      'tooling/qa/codeql/codeql-pack.lock.yml',
      'tooling/qa/codeql/qlpack.yml',
      'tooling/qa/codeql/sniptale-custom.qls',
    ],
    owners: {
      scope: 'tooling/qa/codeql/config.mjs',
      decision: 'tooling/qa/core/codeql-proof.mjs',
      execution: 'tooling/qa/audits/codeql.mjs',
      ciTransport: 'tooling/ci/select-codeql-proof.mjs',
      ciMount: 'tooling/ci/codeql-proof-host.mjs',
    },
    consumers: ['tooling/qa/audits/codeql.mjs'],
    proof: 'successful CodeQL only',
    rollback: 'delete proof',
    collisionCheck: 'atomic output',
  };
  writeFile(root, 'tooling/configs/qa/codeql-proof-reuse.data.json', `${JSON.stringify(policy)}\n`);
  writeFile(root, policy.configPath, generateCodeqlConfig(policy));
  for (const file of policy.controlFiles.filter((file) => file !== policy.configPath)) {
    if (!fs.existsSync(path.join(root, file))) writeFile(root, file, `${file}\n`);
  }
  writeFile(root, policy.baselinePath, '{"findings":[]}\n');
  writeFile(root, 'tooling/qa/codeql/lib/owner.qll', 'predicate owner() { any() }\n');
  writeFile(root, 'tooling/qa/codeql/queries/security/query.ql', 'select 1\n');
  writeFile(root, 'apps/extension/src/product.ts', 'export const product = true;\n');
  writeFile(root, 'apps/extension/src/product.test.ts', 'throw new Error("test");\n');
  writeFile(root, 'packages/example/fixtures/input.ts', 'export const fixture = true;\n');
  writeFile(root, 'tooling/release/notes/v0.3.1.md', 'alpha notes\n');
  const sarifPath = writeFile(
    root,
    policy.sarifPath,
    '{"version":"2.1.0","runs":[{"results":[]}]}\n'
  );
  return { policy, root, sarifPath };
}

it('reuses CodeQL only for the exact production sources, controls, image, and SARIF', async () => {
  const { root, sarifPath } = createPolicyRoot();
  process.env.SNIPTALE_CI_CONTAINER_DIGEST = `sha256:${'a'.repeat(64)}`;
  const module = await import('./codeql-proof.mjs');
  const proof = module.recordSuccessfulCodeqlProof({ cwd: root, sarifPath });

  writeFile(root, 'README.md', 'unrelated\n');
  fs.appendFileSync(path.join(root, 'tooling/release/notes/v0.3.1.md'), 'more notes\n');
  fs.appendFileSync(path.join(root, 'apps/extension/src/product.test.ts'), 'test drift\n');
  expect(module.resolveReusableCodeqlProof({ cwd: root })).toMatchObject({
    matched: true,
    proof: { proofDigest: proof.proofDigest },
  });

  fs.appendFileSync(
    path.join(root, 'apps/extension/src/product.ts'),
    'export const changed = true;\n'
  );
  expect(module.resolveReusableCodeqlProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'CodeQL proof inputs changed',
  });
});

it('invalidates CodeQL proof for query, config, baseline, image, or SARIF drift', async () => {
  const mutations = [
    ['tooling/qa/codeql/queries/security/query.ql', 'query drift\n'],
    ['tooling/configs/qa/codeql-baseline.json', 'baseline drift\n'],
    ['tooling/configs/qa/codeql-config.yml', '# config drift\n'],
  ];
  const module = await import('./codeql-proof.mjs');
  for (const [file, bytes] of mutations) {
    const { root, sarifPath } = createPolicyRoot();
    process.env.SNIPTALE_CI_CONTAINER_DIGEST = `sha256:${'b'.repeat(64)}`;
    module.recordSuccessfulCodeqlProof({ cwd: root, sarifPath });
    fs.appendFileSync(path.join(root, file), bytes);
    expect(module.resolveReusableCodeqlProof({ cwd: root }).matched).toBe(false);
  }

  const { root, sarifPath } = createPolicyRoot();
  process.env.SNIPTALE_CI_CONTAINER_DIGEST = `sha256:${'c'.repeat(64)}`;
  module.recordSuccessfulCodeqlProof({ cwd: root, sarifPath });
  process.env.SNIPTALE_CI_CONTAINER_DIGEST = `sha256:${'d'.repeat(64)}`;
  expect(module.resolveReusableCodeqlProof({ cwd: root }).matched).toBe(false);
  process.env.SNIPTALE_CI_CONTAINER_DIGEST = `sha256:${'c'.repeat(64)}`;
  fs.appendFileSync(sarifPath, 'corrupt');
  expect(module.resolveReusableCodeqlProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'CodeQL proof SARIF changed',
  });
});

it('keeps generated data, specs, tests, and fixtures outside production CodeQL scope', async () => {
  const { root } = createPolicyRoot();
  const module = await import('./codeql-proof.mjs');
  const policy = JSON.parse(
    fs.readFileSync(path.join(root, 'tooling/configs/qa/codeql-proof-reuse.data.json'), 'utf8')
  );
  expect(module.isCodeqlProductionSourcePath('apps/extension/src/product.ts', policy)).toBe(true);
  for (const file of [
    'apps/extension/src/product.test.ts',
    'apps/extension/src/product.spec.tsx',
    'apps/extension/src/generated/model.ts',
    'apps/extension/src/model.generated.ts',
    'apps/extension/src/catalog.data.ts',
    'packages/example/fixtures/input.ts',
  ]) {
    expect(module.isCodeqlProductionSourcePath(file, policy), file).toBe(false);
  }
});

it('publishes a fresh passing receipt and skips the engine on an exact reuse', () => {
  const { root } = createPolicyRoot();
  process.env.SNIPTALE_CI_CONTAINER_DIGEST = `sha256:${'e'.repeat(64)}`;
  process.env.SNIPTALE_TRUSTED_CI_ROOT = root;
  const outputRoot = path.join(root, '.tmp/codeql');
  let commands = 0;
  const runner = (_command: string, args: string[]) => {
    commands += 1;
    if (args[1] === 'analyze') {
      writeFile(root, '.tmp/codeql/results.sarif', '{"version":"2.1.0","runs":[{"results":[]}]}\n');
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  const first = runCodeqlCheck({
    executable: 'codeql',
    outputRoot,
    proofReuse: true,
    runCommandImpl: runner,
    sourceRoot: root,
  });
  expect(first.violations).toEqual([]);
  expect('reused' in first).toBe(false);
  expect(commands).toBe(2);

  const second = runCodeqlCheck({
    executable: 'codeql',
    outputRoot,
    proofReuse: true,
    runCommandImpl: () => {
      throw new Error('CodeQL engine must not run for an exact proof reuse');
    },
    sourceRoot: root,
  });
  expect(second).toMatchObject({ reused: true, violations: [] });
  expect(second.summaryText).toContain('CodeQL proof reused');
});
