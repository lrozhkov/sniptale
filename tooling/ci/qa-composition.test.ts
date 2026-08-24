import fs from 'node:fs';

import { expect, it } from 'vitest';

import { createReleaseControlOccurrences } from '../qa/core/qa-steps/release-occurrences.mjs';
import { collectCiProofResults, collectCiReleaseResults } from './qa-composition.mjs';
import { createTrustedControlMatrix } from './trusted-control-matrix.mjs';

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

  const reusedRelease = await collectCiReleaseResults({
    reuseFastProof: true,
    productProofCollector: async () => {
      throw new Error('verified Fast proof reuse must not rerun Fast controls');
    },
    releaseDeltaCollector: async () => ({
      steps: [
        { label: 'Unit tests', status: 'ok' },
        { label: 'Test coverage', status: 'skipped' },
        { label: 'Build', status: 'ok' },
        { label: 'Release archive', status: 'ok' },
      ],
    }),
    auditCollector: async () => ({ steps: [passed] }),
    mutationCollector: () => passed,
  });
  expect(reusedRelease).toMatchObject({ executionMode: 'reuse-fast-proof' });
  expect(reusedRelease.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Fast proof reuse', status: 'ok' }),
      expect.objectContaining({ label: 'Oxlint', status: 'ok' }),
      expect.objectContaining({ label: 'Unit tests', status: 'ok' }),
      expect.objectContaining({ label: 'Test coverage', status: 'skipped' }),
      expect.objectContaining({ label: 'Build', status: 'ok' }),
      expect.objectContaining({ label: 'Release archive', status: 'ok' }),
    ])
  );
  expect(reusedRelease.steps.filter(({ label }) => label === 'Unit tests')).toHaveLength(1);
  expect(reusedRelease.steps.filter(({ label }) => label === 'Build')).toHaveLength(1);
});

it('keeps the trusted phase orchestrator aligned with admission policy', () => {
  const admission = JSON.parse(
    fs.readFileSync('tooling/configs/ci/trusted-admission-policy.json', 'utf8')
  );
  const runLane = fs.readFileSync('tooling/ci/run-lane.mjs', 'utf8');
  const container = fs.readFileSync('tooling/ci/container.mjs', 'utf8');
  const containerCommand = fs.readFileSync('tooling/ci/container-command.mjs', 'utf8');
  for (const lane of ['proof', 'release']) {
    for (const phase of admission.lanes[lane].freshPhases) {
      expect(containerCommand, `${lane}:${phase}`).toContain(`'${phase}'`);
    }
  }
  expect(container).toContain('${trustedRoot}:/opt/sniptale-trusted:ro');
  expect(container).toContain("path.join(trustedRoot, 'tooling/ci/run-lane.mjs')");
  expect(runLane).toContain("spawnSync('docker', invocation");
});

it('derives trusted release control admission from the executable occurrence owner', () => {
  const occurrences = createReleaseControlOccurrences();
  const proof = createTrustedControlMatrix('proof');
  const release = createTrustedControlMatrix('release');
  for (const { id } of occurrences) {
    if (['qa.rule.unit-tests', 'qa.rule.test-coverage'].includes(id)) {
      expect(proof.allowedSkipped).toContain(id);
    } else {
      expect(proof.requiredPassed).toContain(id);
    }
    if (id === 'qa.rule.test-coverage') {
      expect(release.allowedSkipped).toContain(id);
    } else {
      expect(release.requiredPassed).toContain(id);
    }
  }
  expect(release.requiredPassed).toContain('qa.rule.full-product-coverage');
});

it('fails closed when the release-only result closure is incomplete', async () => {
  await expect(
    collectCiReleaseResults({
      reuseFastProof: true,
      releaseDeltaCollector: async () => ({
        steps: [
          { label: 'Unit tests', status: 'ok' },
          { label: 'Test coverage', status: 'skipped' },
          { label: 'Build', status: 'ok' },
        ],
      }),
    })
  ).rejects.toThrow('Missing release-only control result: Release archive');
});
