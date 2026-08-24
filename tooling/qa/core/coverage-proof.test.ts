import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { createTempRoot, writeFile } from './test-helpers';
import {
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
