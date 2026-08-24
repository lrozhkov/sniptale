import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

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

it('runs the Fast audit after returned product failures and aggregates both results', async () => {
  const auditCollector = vi.fn(async () => ({
    steps: [{ label: 'npm audit', status: 'failed' as const }],
  }));

  const result = await collectCiProofResults({
    productProofCollector: async () => ({
      steps: [{ label: 'Oxlint', status: 'failed' as const }],
    }),
    auditCollector,
  });

  expect(auditCollector).toHaveBeenCalledWith({ profileId: 'pr', session: undefined });
  expect(result.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Oxlint', status: 'failed' }),
      expect.objectContaining({ label: 'npm audit', status: 'failed' }),
    ])
  );
});

it('runs the release audit and every mutation profile after returned failures', async () => {
  const auditCollector = vi.fn(async () => ({
    steps: [{ label: 'CodeQL', status: 'failed' as const }],
  }));
  const mutationCollector = vi.fn((profile: string) => ({
    label: `Mutation ${profile}`,
    status: 'failed' as const,
  }));

  const result = await collectCiReleaseResults({
    productProofCollector: async () => ({
      steps: [{ label: 'Unit tests', status: 'failed' as const }],
    }),
    auditCollector,
    mutationCollector,
  });

  expect(auditCollector).toHaveBeenCalledWith({
    profileId: 'release',
    reusedControlIds: [],
    session: undefined,
  });
  expect(mutationCollector.mock.calls.map(([profile]) => profile)).toEqual([
    'persistence',
    'secrets',
  ]);
  expect(result.steps.map(({ label, status }) => [label, status])).toEqual([
    ['Unit tests', 'failed'],
    ['CodeQL', 'failed'],
    ['Mutation persistence', 'failed'],
    ['Mutation secrets', 'failed'],
  ]);
});

it('keeps infrastructure exceptions fail-fast instead of treating them as control results', async () => {
  const auditCollector = vi.fn();
  const mutationCollector = vi.fn();

  await expect(
    collectCiReleaseResults({
      productProofCollector: async () => {
        throw new Error('worker result envelope is unavailable');
      },
      auditCollector,
      mutationCollector,
    })
  ).rejects.toThrow('worker result envelope is unavailable');
  expect(auditCollector).not.toHaveBeenCalled();
  expect(mutationCollector).not.toHaveBeenCalled();
});
