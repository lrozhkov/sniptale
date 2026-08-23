import fs from 'node:fs';

import { expect, it } from 'vitest';

import { collectCiProofResults, collectCiReleaseResults } from './qa-composition.mjs';

const passed = { label: 'passed', status: 'ok' as const };

it('machine-fixes full Vitest and release readiness to ci:release only', async () => {
  const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/proof-semantics.json', 'utf8'));
  expect(policy.gateCapabilities.proof).toMatchObject({ fullVitest: false, releaseReady: false });
  expect(policy.gateCapabilities.proof.scope).toBe('repository-wide');
  expect(policy.gateCapabilities.release).toMatchObject({
    scope: 'repository-wide',
    fullVitest: true,
    releaseReady: true,
  });
  expect(policy.invariants.diffAwareWrappersExactly).toEqual([
    'qa:release-harness',
    'qa:checkpoint',
    'qa:closeout',
  ]);
  const source = fs.readFileSync('tooling/ci/qa-composition.mjs', 'utf8');
  expect(source).toContain('includeTests: false');
  expect(source).toContain('resolveRepositoryVerifyScope()');
  expect(source).not.toContain('resolveFullVerifyScope');
  expect(source).not.toContain('runReleaseWrapper');
  const proof = await collectCiProofResults({
    productProofCollector: async () => ({ steps: [passed] }),
    auditCollector: async () => ({ steps: [passed] }),
  });
  const release = await collectCiReleaseResults({
    productProofCollector: async () => ({ steps: [passed] }),
    auditCollector: async () => ({ steps: [passed] }),
    mutationCollector: () => passed,
  });
  expect(proof.context).toMatchObject({ mode: 'ci:proof' });
  expect(proof.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Unit tests', status: 'skipped' }),
      expect.objectContaining({ label: 'Test coverage', status: 'skipped' }),
    ])
  );
  expect(release.context).toMatchObject({ mode: 'ci:release' });
});

it('keeps the trusted phase orchestrator aligned with admission policy', () => {
  const admission = JSON.parse(
    fs.readFileSync('tooling/configs/ci/trusted-admission-policy.json', 'utf8')
  );
  const runLane = fs.readFileSync('tooling/ci/run-lane.mjs', 'utf8');
  const container = fs.readFileSync('tooling/ci/container.mjs', 'utf8');
  for (const lane of ['proof', 'release']) {
    for (const phase of admission.lanes[lane].freshPhases) {
      expect(runLane, `${lane}:${phase}`).toContain(`'${phase}'`);
    }
  }
  expect(container).toContain('${trustedRoot}:/opt/sniptale-trusted:ro');
  expect(container).toContain('/opt/sniptale-trusted/tooling/ci/run-lane.mjs');
});
