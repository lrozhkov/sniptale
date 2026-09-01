import fs from 'node:fs';

import { expect, it, vi } from 'vitest';

import { createReleaseControlOccurrences } from '../qa/composition/catalog/release-occurrences.mjs';
import {
  collectCiProofResults,
  collectCiReleaseResults,
  collectFreshProductionBuildStep,
} from './qa-composition.mjs';
import { createCiProductControlOccurrences } from './product-control-policy.mjs';
import { createTrustedControlMatrix } from './trusted-control-matrix.mjs';

const FAST_ADMISSION = {
  artifactKind: 'sniptale-fast-proof-admission',
  outcome: 'admitted',
  proofSemanticDigest: `sha256:${'1'.repeat(64)}`,
  proofManifestDigest: `sha256:${'2'.repeat(64)}`,
  sourceRunRecord: '.tmp/qa-observability/runs/2026-09-01/proof.json',
  sourceRunLog: '.tmp/qa-logs/2026-09-01/proof.log',
};

const releaseDelta = () => ({
  steps: [
    { label: 'Build', status: 'ok' as const },
    { label: 'Release archive', status: 'ok' as const },
  ],
});

it('assigns full product tests, coverage, and harness tests to Fast proof', async () => {
  const productProofCollector = vi.fn(async () => ({
    steps: [{ label: 'Oxlint', status: 'ok' as const }],
  }));
  const auditCollector = vi.fn(async () => ({
    steps: [{ label: 'Full product coverage', status: 'ok' as const }],
  }));
  const harnessTestCollector = vi.fn(async () => ({
    label: 'Harness unit tests',
    status: 'ok' as const,
  }));
  const productionBuildCollector = vi.fn(() => ({
    label: 'Production build',
    status: 'ok' as const,
  }));

  const result = await collectCiProofResults({
    productProofCollector,
    auditCollector,
    harnessTestCollector,
    productionBuildCollector,
  });

  expect(result.steps.map(({ label }) => label)).toEqual([
    'Oxlint',
    'Unit tests',
    'Harness unit tests',
    'Production build',
    'Full product coverage',
  ]);
  expect(result.steps.find(({ label }) => label === 'Unit tests')?.detail).toContain(
    'shared-execution=full-product-test-proof'
  );
  expect(auditCollector).toHaveBeenCalledWith({
    profileId: 'pr',
    session: undefined,
  });
});

it('requires an admitted exact Fast proof and runs only the release delta', async () => {
  const releaseDeltaCollector = vi.fn(async () => releaseDelta());
  const auditCollector = vi.fn(async () => ({ steps: [] }));
  const result = await collectCiReleaseResults({
    fastProofAdmission: FAST_ADMISSION,
    releaseDeltaCollector,
    auditCollector,
  });

  expect(result.executionMode).toBe('admitted-fast-proof');
  expect(result.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Fast proof reuse', status: 'ok' }),
      expect.objectContaining({ label: 'Oxlint', status: 'inherited' }),
      expect.objectContaining({
        label: 'Production build',
        status: 'inherited',
      }),
      expect.objectContaining({ label: 'Build', status: 'ok' }),
      expect.objectContaining({ label: 'Release archive', status: 'ok' }),
    ])
  );
  expect(result.steps.map(({ label }) => label)).not.toContain('Unit tests');

  await expect(collectCiReleaseResults({ releaseDeltaCollector, auditCollector })).rejects.toThrow(
    'requires an admitted exact Fast proof'
  );
});

it('fails closed when the release-only result closure is incomplete', async () => {
  await expect(
    collectCiReleaseResults({
      fastProofAdmission: FAST_ADMISSION,
      releaseDeltaCollector: async () => ({
        steps: [{ label: 'Build', status: 'ok' as const }],
      }),
      auditCollector: async () => ({ steps: [] }),
    })
  ).rejects.toThrow('Missing release-only control result: Release archive');
});

it('inherits the exact audit controls already owned by Fast proof', async () => {
  const auditCollector = vi.fn(async () => ({
    steps: [
      { label: 'Full product coverage', status: 'ok' as const },
      { label: 'npm audit', status: 'ok' as const },
    ],
  }));
  const result = await collectCiReleaseResults({
    fastProofAdmission: FAST_ADMISSION,
    releaseDeltaCollector: async () => releaseDelta(),
    auditCollector,
  });

  expect(auditCollector).toHaveBeenCalledWith({
    profileId: 'release',
    reusedControlIds: ['full-product-coverage', 'ast-grep', 'knip', 'jscpd'],
    session: undefined,
  });
  expect(result.steps.find(({ label }) => label === 'Full product coverage')).toMatchObject({
    status: 'inherited',
  });
  expect(result.steps.find(({ label }) => label === 'npm audit')).toMatchObject({ status: 'ok' });
});

it('keeps the trusted phase orchestrator and control matrix aligned with policy', () => {
  const admission = JSON.parse(
    fs.readFileSync('tooling/configs/ci/trusted-admission-policy.json', 'utf8')
  );
  const containerCommand = fs.readFileSync('tooling/ci/container-command.mjs', 'utf8');
  for (const lane of ['proof', 'release']) {
    for (const phase of admission.lanes[lane].freshPhases) {
      expect(containerCommand, `${lane}:${phase}`).toContain(`'${phase}'`);
    }
  }

  const occurrences = createReleaseControlOccurrences();
  const proof = createTrustedControlMatrix('proof');
  const release = createTrustedControlMatrix('release');
  const proofIds = new Set(createCiProductControlOccurrences('proof').map(({ id }) => id));
  const releaseIds = new Set(createCiProductControlOccurrences('release').map(({ id }) => id));
  for (const { id } of occurrences) {
    if (proofIds.has(id) && !proof.allowedSkipped.includes(id)) {
      expect(proof.requiredPassed).toContain(id);
    }
    if (releaseIds.has(id) && !release.allowedSkipped.includes(id)) {
      expect([...release.requiredPassed, ...release.requiredInherited]).toContain(id);
    }
  }
  expect(proof.requiredPassed).toContain('qa.rule.full-product-coverage');
  expect(release.requiredInherited).toContain('qa.rule.full-product-coverage');
});

it('keeps infrastructure exceptions fail-fast', async () => {
  const auditCollector = vi.fn();
  await expect(
    collectCiReleaseResults({
      fastProofAdmission: FAST_ADMISSION,
      releaseDeltaCollector: async () => {
        throw new Error('worker result envelope is unavailable');
      },
      auditCollector,
    })
  ).rejects.toThrow('worker result envelope is unavailable');
  expect(auditCollector).not.toHaveBeenCalled();
});

it('runs a fresh production build exactly once when explicitly requested', () => {
  const commandRunner = vi.fn(() => ({ status: 0, stdout: '', stderr: '' }));
  const { label, status } = collectFreshProductionBuildStep({ commandRunner });

  expect({ label, status }).toEqual({
    label: 'Production build',
    status: 'ok',
  });
  expect(commandRunner).toHaveBeenCalledWith(['run', 'build:release']);
});
