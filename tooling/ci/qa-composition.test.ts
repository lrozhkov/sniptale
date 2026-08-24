import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import { createReleaseControlOccurrences } from '../qa/core/qa-steps/release-occurrences.mjs';
import { collectCiProofResults, collectCiReleaseResults } from './qa-composition.mjs';
import { createCiProductControlOccurrences } from './product-control-policy.mjs';
import { createTrustedControlMatrix } from './trusted-control-matrix.mjs';

const passed = { label: 'passed', status: 'ok' as const };

it('machine-fixes full Vitest to Fast proof and release readiness to release provenance', async () => {
  const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/proof-semantics.json', 'utf8'));
  expect(policy.gateCapabilities.proof).toMatchObject({ fullVitest: true, releaseReady: false });
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
  const executionSource = fs.readFileSync('tooling/qa/core/verify-all.execution.mjs', 'utf8');
  expect(source).toContain('includeTests: true');
  expect(source).toContain('resolveRepositoryVerifyScope()');
  expect(source).not.toContain('resolveFullVerifyScope');
  expect(source).not.toContain('runReleaseWrapper');
  expect(executionSource).toContain('releaseMode ? DEFAULT_OXLINT_ROOTS : codeFiles');
  const proof = await collectCiProofResults({
    productProofCollector: async () => ({
      steps: [
        passed,
        { label: 'Unit tests', status: 'ok' },
        { label: 'Test coverage', status: 'skipped' },
      ],
    }),
    auditCollector: async () => ({ steps: [passed] }),
  });
  const release = await collectCiReleaseResults({
    reuseFastProof: true,
    releaseDeltaCollector: async () => ({
      steps: [
        { label: 'SonarJS', status: 'ok' },
        { label: 'Build', status: 'ok' },
        { label: 'Release archive', status: 'ok' },
      ],
    }),
    auditCollector: async () => ({ steps: [passed] }),
    mutationCollector: () => passed,
  });
  expect(proof.context).toMatchObject({ mode: 'ci:proof' });
  expect(proof.steps).toEqual(
    expect.arrayContaining([expect.objectContaining({ label: 'Unit tests', status: 'ok' })])
  );
  expect(proof.steps.map(({ label }) => label)).not.toContain('Test coverage');
  expect(release.context).toMatchObject({ mode: 'ci:release' });

  const reusedRelease = await collectCiReleaseResults({
    reuseFastProof: true,
    productProofCollector: async () => {
      throw new Error('verified Fast proof reuse must not rerun Fast controls');
    },
    releaseDeltaCollector: async () => ({
      steps: [
        { label: 'SonarJS', status: 'ok' },
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
      expect.objectContaining({ label: 'SonarJS', status: 'ok' }),
      expect.objectContaining({ label: 'Build', status: 'ok' }),
      expect.objectContaining({ label: 'Release archive', status: 'ok' }),
    ])
  );
  expect(reusedRelease.steps.map(({ label }) => label)).not.toContain('Unit tests');
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

it('derives trusted CI control admission from the executable occurrence owner', () => {
  const occurrences = createReleaseControlOccurrences();
  const proof = createTrustedControlMatrix('proof');
  const release = createTrustedControlMatrix('release');
  const proofIds = new Set(createCiProductControlOccurrences('proof').map(({ id }) => id));
  const releaseIds = new Set(createCiProductControlOccurrences('release').map(({ id }) => id));
  for (const { id } of occurrences) {
    if (proofIds.has(id) && !proof.allowedSkipped.includes(id)) {
      expect(proof.requiredPassed).toContain(id);
    } else if (!proofIds.has(id)) {
      expect(proof.requiredPassed).not.toContain(id);
      expect(proof.allowedSkipped).not.toContain(id);
    }
    if (releaseIds.has(id) && !release.allowedSkipped.includes(id)) {
      expect(release.requiredPassed).toContain(id);
    } else if (!releaseIds.has(id)) {
      expect(release.requiredPassed).not.toContain(id);
      expect(release.allowedSkipped).not.toContain(id);
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
          { label: 'SonarJS', status: 'ok' },
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
      steps: createCiProductControlOccurrences('proof').map(({ label }) => ({
        label,
        status: label === 'Unit tests' ? ('failed' as const) : ('ok' as const),
      })),
    }),
    releaseDeltaCollector: async () => ({
      steps: [
        { label: 'SonarJS', status: 'ok' as const },
        { label: 'Build', status: 'ok' as const },
        { label: 'Release archive', status: 'ok' as const },
      ],
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
    ...createCiProductControlOccurrences('proof').map(({ label }) => [
      label,
      label === 'Unit tests' ? 'failed' : 'ok',
    ]),
    ['SonarJS', 'ok'],
    ['CodeQL', 'failed'],
    ['Mutation persistence', 'failed'],
    ['Mutation secrets', 'failed'],
  ]);
});

it('shares one observed repository scope across fresh Fast and release-only controls', async () => {
  const verifyScope = { kind: 'repository-scope' };
  const scopeResolver = vi.fn(() => verifyScope);
  const productProofCollector = vi.fn(async () => ({
    steps: createCiProductControlOccurrences('proof').map(({ label }) => ({
      label,
      status: 'ok' as const,
    })),
  }));
  const releaseDeltaCollector = vi.fn(async () => ({
    steps: [
      { label: 'SonarJS', status: 'ok' as const },
      { label: 'Build', status: 'ok' as const },
      { label: 'Release archive', status: 'ok' as const },
    ],
  }));

  await collectCiReleaseResults({
    scopeResolver,
    productProofCollector,
    releaseDeltaCollector,
    auditCollector: async () => ({ steps: [] }),
    mutationCollector: () => passed,
  });

  expect(scopeResolver).toHaveBeenCalledOnce();
  expect(productProofCollector).toHaveBeenCalledWith(verifyScope);
  expect(releaseDeltaCollector).toHaveBeenCalledWith(verifyScope);
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
