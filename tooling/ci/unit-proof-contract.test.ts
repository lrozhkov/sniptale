import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps verified unit proof transport subordinate to the canonical QA owner', () => {
  const policy = JSON.parse(
    fs.readFileSync('tooling/configs/qa/unit-proof-reuse.data.json', 'utf8')
  );
  const workflow = fs.readFileSync('.github/workflows/quality-gate.yml', 'utf8');
  const container = fs.readFileSync('tooling/ci/container.mjs', 'utf8');
  const artifacts = fs.readFileSync('tooling/ci/artifacts.mjs', 'utf8');

  expect(policy).toMatchObject({
    schemaVersion: 1,
    proofPath: '.tmp/qa/unit-proof.json',
    owners: {
      decision: 'tooling/qa/core/unit-test-proof.mjs',
      execution: 'tooling/qa/core/verify-all.unit-test-steps.mjs',
      ciTransport: 'tooling/ci/select-unit-proof.mjs',
      ciMount: 'tooling/ci/unit-proof-host.mjs',
    },
  });
  for (const consumer of policy.consumers) expect(fs.existsSync(consumer)).toBe(true);
  expect(workflow).toContain('Restore verified reusable proof inputs');
  expect(workflow).toContain('select-unit-proof.mjs');
  expect(workflow).toContain('select-unit-proof.mjs restore-latest-release');
  expect(workflow).toContain('SNIPTALE_UNIT_PROOF_PATH=$unit_proof');
  expect(workflow).toContain('unit_root="$RUNNER_TEMP/release-unit-proof"');
  expect(container).toContain("'SNIPTALE_UNIT_PROOF_AUTHORITY=external-only'");
  expect(container).toContain('/opt/sniptale-unit-proof.json:ro');
  expect(artifacts).toContain("'.tmp/qa/unit-proof.json'");
});
