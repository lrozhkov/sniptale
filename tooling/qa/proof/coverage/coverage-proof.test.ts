import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createProofDigest } from '../contracts/proof-input.mjs';
import { recordSuccessfulFullUnitProof } from '../unit/unit-test-proof.mjs';
import { createTempRoot, writeFile } from '../../test-support/test-helpers';
import {
  createCoverageProofInputs,
  readVerifiedCoverageReport,
  materializeReusableCoverageProof,
  recordSuccessfulCoverageProof,
  resolveReusableCoverageProof,
} from './coverage-proof.mjs';

const proofEnvironmentKeys = [
  'SNIPTALE_CI_CONTAINER_DIGEST',
  'SNIPTALE_COVERAGE_PROOF_PATH',
  'SNIPTALE_COVERAGE_REPORTS_PATH',
  'SNIPTALE_COVERAGE_PROOF_AUTHORITY',
  'SNIPTALE_CANDIDATE_CONTROL_DIGEST',
] as const;
const originalProofEnvironment = new Map(
  proofEnvironmentKeys.map((key) => [key, process.env[key]])
);

beforeEach(() => {
  for (const key of proofEnvironmentKeys) delete process.env[key];
  process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = `sha256:${'a'.repeat(64)}`;
});

it('rejects coverage reuse across candidate control digests', () => {
  const { root } = fixture();
  recordSuccessfulCoverageProof({ cwd: root });
  process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = `sha256:${'b'.repeat(64)}`;
  expect(resolveReusableCoverageProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'coverage proof control digest changed',
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of proofEnvironmentKeys) {
    const original = originalProofEnvironment.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

function fixture() {
  const root = createTempRoot('coverage-proof-');
  const policy = JSON.parse(
    fs.readFileSync('tooling/configs/qa/coverage-proof-reuse.data.json', 'utf8')
  );
  writeFile(root, 'tooling/configs/qa/coverage-proof-reuse.data.json', JSON.stringify(policy));
  for (const file of policy.configFiles) {
    if (!fs.existsSync(path.join(root, file))) writeFile(root, file, `${file}\n`);
  }
  const unitPolicy = JSON.parse(
    fs.readFileSync('tooling/configs/qa/unit-proof-reuse.data.json', 'utf8')
  );
  for (const file of unitPolicy.configFiles) {
    if (!fs.existsSync(path.join(root, file))) writeFile(root, file, `${file}\n`);
  }
  writeFile(root, 'tooling/configs/qa/unit-proof-reuse.data.json', JSON.stringify(unitPolicy));
  writeFile(root, 'packages/foundation/src/value.ts', 'export const value = 1;\n');
  writeFile(root, 'tooling/qa/runner.mjs', 'export const runner = true;\n');
  writeFile(root, 'apps/extension/src/example.ts', 'export const value = 1;\n');
  writeFile(root, 'apps/extension/src/example.test.ts', 'test("value", () => {});\n');
  writeFile(root, 'tooling/test/example.spec.ts', 'test("support", () => {});\n');
  writeFile(root, 'tooling/test/harness/helper.ts', 'export const harness = true;\n');
  writeFile(root, 'tooling/test/support/fixture.ts', 'export const fixture = true;\n');
  for (const file of policy.reportFiles)
    writeFile(root, `${policy.reportDirectory}/${file}`, `${file}\n`);
  return { policy, root };
}

it('reuses coverage only when production, tests, config, lock, image, and every report match', () => {
  const { policy, root } = fixture();
  process.env.SNIPTALE_CI_CONTAINER_DIGEST = `sha256:${'a'.repeat(64)}`;
  recordSuccessfulCoverageProof({ cwd: root });
  expect(resolveReusableCoverageProof({ cwd: root }).matched).toBe(true);

  writeFile(root, 'README.md', 'unrelated\n');
  expect(resolveReusableCoverageProof({ cwd: root }).matched).toBe(true);

  fs.appendFileSync(path.join(root, 'apps/extension/src/example.test.ts'), 'changed\n');
  expect(resolveReusableCoverageProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'coverage proof inputs changed',
  });

  fs.writeFileSync(
    path.join(root, 'apps/extension/src/example.test.ts'),
    'test("value", () => {});\n'
  );
  fs.appendFileSync(path.join(root, 'tooling/test/harness/helper.ts'), 'changed\n');
  expect(resolveReusableCoverageProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'coverage proof inputs changed',
  });
  fs.writeFileSync(
    path.join(root, 'tooling/test/harness/helper.ts'),
    'export const harness = true;\n'
  );
  fs.appendFileSync(path.join(root, 'tooling/test/support/fixture.ts'), 'changed\n');
  expect(resolveReusableCoverageProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'coverage proof inputs changed',
  });
  fs.writeFileSync(
    path.join(root, 'tooling/test/support/fixture.ts'),
    'export const fixture = true;\n'
  );
  fs.appendFileSync(path.join(root, policy.reportDirectory, 'lcov.info'), 'tampered\n');
  expect(resolveReusableCoverageProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'coverage proof reports changed',
  });
});

it('refreshes validated local reports when materializing reusable coverage', () => {
  const { policy, root } = fixture();
  recordSuccessfulCoverageProof({ cwd: root });
  const staleTime = new Date(0);
  for (const file of policy.reportFiles) {
    fs.utimesSync(path.join(root, policy.reportDirectory, file), staleTime, staleTime);
  }
  const reusable = resolveReusableCoverageProof({ cwd: root });
  expect(reusable.matched).toBe(true);
  const materializedAt = Date.now();

  materializeReusableCoverageProof(reusable, { cwd: root });

  for (const file of policy.reportFiles) {
    expect(
      fs.statSync(path.join(root, policy.reportDirectory, file)).mtimeMs
    ).toBeGreaterThanOrEqual(materializedAt - 1000);
  }
});

it('materializes an admitted external receipt without granting candidate-local authority', () => {
  const source = fixture();
  process.env.SNIPTALE_CI_CONTAINER_DIGEST = `sha256:${'b'.repeat(64)}`;
  recordSuccessfulCoverageProof({ cwd: source.root });
  const candidate = fixture();
  process.env.SNIPTALE_COVERAGE_PROOF_AUTHORITY = 'external-only';
  process.env.SNIPTALE_COVERAGE_PROOF_PATH = path.join(source.root, source.policy.proofPath);
  process.env.SNIPTALE_COVERAGE_REPORTS_PATH = path.join(
    source.root,
    source.policy.reportDirectory
  );
  const reusable = resolveReusableCoverageProof({ cwd: candidate.root });
  expect(reusable.matched).toBe(true);
  fs.rmSync(path.join(candidate.root, candidate.policy.reportDirectory), {
    recursive: true,
    force: true,
  });
  materializeReusableCoverageProof(reusable, { cwd: candidate.root });
  expect(
    fs.readFileSync(
      path.join(candidate.root, candidate.policy.reportDirectory, 'lcov.info'),
      'utf8'
    )
  ).toBe('lcov.info\n');
});

it('rejects old coverage after an excluded runtime change even with fresh independent unit proof', () => {
  const { root } = fixture();
  const file = 'apps/extension/src/example.constants.ts';
  writeFile(root, file, 'export const value = 1;\n');
  recordSuccessfulCoverageProof({ cwd: root });
  writeFile(root, file, 'export const value = 2;\n');
  recordSuccessfulFullUnitProof({ cwd: root, pool: 'threads' });
  expect(resolveReusableCoverageProof({ cwd: root }).matched).toBe(false);
});

it('rejects a different coverage execution pool', () => {
  const { root } = fixture();
  recordSuccessfulCoverageProof({ cwd: root });
  expect(resolveReusableCoverageProof({ cwd: root, pool: 'forks' }).matched).toBe(false);
});

it('rejects legacy coverage without its own execution binding', () => {
  const { root, policy } = fixture();
  const proof = recordSuccessfulCoverageProof({ cwd: root });
  delete proof.fullUnit;
  proof.schemaVersion = 1;
  proof.proofDigest = createProofDigest(proof);
  writeFile(root, policy.proofPath, JSON.stringify(proof));
  expect(resolveReusableCoverageProof({ cwd: root }).matched).toBe(false);
});

it('rejects coverage when the current timezone differs from its producer', () => {
  const { root } = fixture();
  const moduleUrl = new URL('./coverage-proof.mjs', import.meta.url).href;
  const run = (timezone: string, operation: string) =>
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import * as proof from ${JSON.stringify(moduleUrl)};
         const result = proof.${operation}({ cwd: process.argv[1] });
         console.log(JSON.stringify(result));`,
        root,
      ],
      { encoding: 'utf8', env: { ...process.env, TZ: timezone } }
    );
  const producer = JSON.parse(run('UTC', 'recordSuccessfulCoverageProof'));
  expect(producer.fullUnit.execution.timezone).toBe('UTC');
  expect(JSON.parse(run('Europe/Moscow', 'resolveReusableCoverageProof'))).toMatchObject({
    matched: false,
    reason: 'coverage proof inputs changed',
  });
});

it('cannot publish coverage against inputs changed during the run', () => {
  const { root } = fixture();
  const inputs = createCoverageProofInputs({ cwd: root });
  writeFile(root, 'apps/extension/src/example.constants.ts', 'export const changed = true;\n');
  expect(() => recordSuccessfulCoverageProof({ cwd: root, inputs })).toThrow(
    'Coverage inputs changed during execution.'
  );
});

it('rejects replaced or symlinked report bytes after admission', () => {
  const { root, policy } = fixture();
  recordSuccessfulCoverageProof({ cwd: root });
  const reusable = resolveReusableCoverageProof({ cwd: root });
  const file = path.join(root, policy.reportDirectory, 'coverage-final.json');
  fs.writeFileSync(file, '{}');
  expect(() => readVerifiedCoverageReport(reusable)).toThrow('changed after admission');
  expect(() => materializeReusableCoverageProof(reusable, { cwd: root })).toThrow(
    'changed after admission'
  );
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(root, policy.reportDirectory, 'coverage-summary.json'), file);
  expect(() => readVerifiedCoverageReport(reusable)).toThrow();
});
