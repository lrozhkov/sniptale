import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps coverage scope, reuse authority, transport, reports, and release admission in one contract', () => {
  const policy = JSON.parse(
    fs.readFileSync('tooling/configs/qa/coverage-proof-reuse.data.json', 'utf8')
  );
  const quality = fs.readFileSync('.github/workflows/quality-gate.yml', 'utf8');
  const release = fs.readFileSync('.github/workflows/release.yml', 'utf8');
  const container = fs.readFileSync('tooling/ci/container.mjs', 'utf8');
  const artifacts = fs.readFileSync('tooling/ci/artifacts.mjs', 'utf8');
  const publisher = fs.readFileSync('tooling/ci/prepare-release-assets.mjs', 'utf8');

  expect(policy).toMatchObject({
    schemaVersion: 1,
    proofPath: '.tmp/qa/coverage-proof.json',
    reportDirectory: '.tmp/coverage/canonical',
    reportFiles: ['coverage-final.json', 'coverage-summary.json', 'lcov.info', 'html/index.html'],
    owners: {
      decision: 'tooling/qa/core/coverage-proof.mjs',
      execution: 'tooling/qa/core/audit-coverage-step.mjs',
      ciTransport: 'tooling/ci/select-coverage-proof.mjs',
      ciMount: 'tooling/ci/coverage-proof-host.mjs',
    },
  });
  for (const consumer of policy.consumers) expect(fs.existsSync(consumer)).toBe(true);
  expect(quality.match(/select-coverage-proof\.mjs restore/gu)).toHaveLength(1);
  expect(quality).toContain('SNIPTALE_COVERAGE_PROOF_PATH=$coverage_proof');
  expect(release).toContain('Restore verified main coverage proof');
  expect(container).toContain("'SNIPTALE_COVERAGE_PROOF_AUTHORITY=external-only'");
  expect(container).toContain('/opt/sniptale-coverage-proof.json:ro');
  expect(container).toContain('/opt/sniptale-coverage-reports:ro');
  expect(artifacts).toContain("'.tmp/qa/coverage-proof.json'");
  for (const asset of [
    'codeql.sarif',
    'semgrep.sarif',
    'lcov.info',
    'coverage-final.json',
    'coverage-summary.json',
    'coverage-html.tar.gz',
    'provenance.json',
  ]) {
    expect(publisher).toContain(asset);
  }
});
