import fs from 'node:fs';

import { expect, it } from 'vitest';

import { assertCodeqlConfigIsFresh } from '../qa/audits/codeql/config.mjs';

it('keeps CodeQL scope, reuse authority, CI transport, and artifacts in one contract', () => {
  const policy = JSON.parse(
    fs.readFileSync('tooling/configs/qa/codeql-proof-reuse.data.json', 'utf8')
  );
  const canonicalProof = fs.readFileSync('.github/workflows/_canonical-proof.yml', 'utf8');
  const container = fs.readFileSync('tooling/ci/container.mjs', 'utf8');
  const artifacts = fs.readFileSync('tooling/ci/artifacts.mjs', 'utf8');

  expect(policy).toMatchObject({
    schemaVersion: 1,
    proofPath: '.tmp/qa/codeql-proof.json',
    sarifPath: '.tmp/codeql/results.filtered.sarif',
    sourceRoots: expect.arrayContaining(['apps', 'packages', 'tooling/ci']),
    excludedFileMarkers: expect.arrayContaining(['.test.', '.spec.', '.data.', '.generated.']),
    owners: {
      scope: 'tooling/qa/audits/codeql/config.mjs',
      decision: 'tooling/qa/audits/codeql/codeql-proof.mjs',
      execution: 'tooling/qa/audits/codeql/codeql.mjs',
      ciTransport: 'tooling/ci/select-codeql-proof.mjs',
      ciMount: 'tooling/ci/proof-host-inputs.mjs',
      artifactSeal: 'tooling/ci/proof-artifact-seal.mjs',
    },
  });
  for (const consumer of policy.consumers) expect(fs.existsSync(consumer)).toBe(true);
  expect(() => assertCodeqlConfigIsFresh()).not.toThrow();
  expect(canonicalProof).toContain('Restore verified reusable proof inputs');
  expect(canonicalProof).toContain('select-codeql-proof.mjs restore-latest-release');
  expect(canonicalProof).toContain('SNIPTALE_CODEQL_PROOF_PATH=$codeql_proof');
  expect(canonicalProof).toContain('SNIPTALE_CODEQL_SARIF_PATH=$codeql_sarif');
  expect(canonicalProof).toContain('if [ "$PROOF_LANE" = release ]');
  expect(canonicalProof).not.toContain('select-codeql-proof.mjs restore "$source_sha"');
  expect(container).toContain("'SNIPTALE_CODEQL_PROOF_AUTHORITY=external-only'");
  expect(container).toContain('/opt/sniptale-codeql-proof.json:ro');
  expect(container).toContain('/opt/sniptale-codeql-results.sarif:ro');
  expect(artifacts).toContain("'.tmp/qa/codeql-proof.json'");
});
