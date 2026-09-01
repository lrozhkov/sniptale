import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

import { expect, it, vi } from 'vitest';

import { createReleaseControlOccurrences } from '../qa/composition/catalog/release-occurrences.mjs';
import {
  collectCiProofResults,
  collectCiReleaseResults,
  collectFreshProductionBuildStep,
  resolveCiCandidateDiff,
  resolveCiHarnessTestPlan,
} from './qa-composition.mjs';
import { createCiProductControlOccurrences } from './product-control-policy.mjs';
import { createTrustedControlMatrix } from './trusted-control-matrix.mjs';
import {
  createTempRoot,
  initGitRepo,
  runGit as runFixtureGit,
  withCwd,
  writeFile,
} from '../qa/test-support/test-helpers';

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

function createCandidateGitRunner(stdout: string, comparisonRevision = 'b'.repeat(40)) {
  return (args: string[]) => ({
    skipped: false,
    status: 0,
    stderr: '',
    stdout: args[0] === 'merge-base' ? `${comparisonRevision}\n` : stdout,
  });
}

function gitOutput(root: string, ...args: string[]) {
  return execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', args, {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

it('assigns full product tests, coverage, and harness tests to Fast proof', async () => {
  let productCoverageFinished = false;
  const productProofCollector = vi.fn(async () => ({
    steps: [{ label: 'Oxlint', status: 'ok' as const }],
  }));
  const auditCollector = vi
    .fn(async () => ({
      steps: [{ label: 'Full product coverage', status: 'ok' as const }],
    }))
    .mockImplementationOnce(async () => {
      productCoverageFinished = true;
      return { steps: [{ label: 'Full product coverage', status: 'ok' as const }] };
    });
  const harnessTestCollector = vi.fn(async () => {
    expect(productCoverageFinished).toBe(true);
    return { label: 'Harness unit tests', status: 'ok' as const };
  });
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
  expect(harnessTestCollector).toHaveBeenCalledWith(
    expect.objectContaining({ full: true, reason: 'candidate base unavailable' })
  );
});

it('uses affected harness closure for product-only candidates and full harness for control changes', () => {
  const base = 'a'.repeat(40);
  const productPlan = resolveCiHarnessTestPlan(
    { mode: 'full-suite' },
    {
      environment: { SNIPTALE_BASE_SHA: base },
      gitRunner: createCandidateGitRunner('M\0apps/extension/src/background/index.ts\0'),
    }
  );
  expect(productPlan).toMatchObject({
    full: false,
    reason: 'product-only candidate affected closure',
  });

  expect(
    resolveCiHarnessTestPlan(
      { mode: 'full-suite' },
      {
        environment: { SNIPTALE_BASE_SHA: base },
        gitRunner: createCandidateGitRunner('M\0tooling/ci/qa-composition.mjs\0'),
      }
    )
  ).toMatchObject({ full: true, reason: 'CI/tooling control changed' });
});

it.each([
  ['deleted input', 'D\0apps/extension/src/removed.ts\0'],
  ['type-changed input', 'T\0tooling/ci/qa-composition.mjs\0'],
  ['renamed input', 'R100\0apps/extension/src/old.ts\0apps/extension/src/new.ts\0'],
])('forces full harness for a %s whose affected closure is not sound', (_name, stdout) => {
  expect(
    resolveCiHarnessTestPlan(
      {},
      {
        environment: { SNIPTALE_BASE_SHA: 'a'.repeat(40) },
        gitRunner: createCandidateGitRunner(stdout),
      }
    )
  ).toMatchObject({ full: true, reason: 'candidate deletion, rename, or type change' });
});

it.each(['tooling/qa/line\nbreak.test.ts', 'tooling/qa/tab\tname.test.ts'])(
  'preserves a NUL-delimited hostile harness path: %s',
  (file) => {
    expect(
      resolveCiHarnessTestPlan(
        {},
        {
          environment: { SNIPTALE_BASE_SHA: 'a'.repeat(40) },
          gitRunner: createCandidateGitRunner(`M\0${file}\0`),
        }
      )
    ).toMatchObject({ full: true, reason: 'CI/tooling control changed' });
  }
);

it('uses one merge-base authority for candidate paths and deleted lineage', () => {
  const calls: string[][] = [];
  const comparisonRevision = 'c'.repeat(40);
  const result = resolveCiCandidateDiff({
    environment: { SNIPTALE_BASE_SHA: 'a'.repeat(40) },
    gitRunner: (args) => {
      calls.push(args);
      return createCandidateGitRunner(
        'M\0apps/extension/src/content/current.ts\0D\0apps/extension/src/content/removed.ts\0',
        comparisonRevision
      )(args);
    },
  });

  expect(result).toMatchObject({
    available: true,
    comparisonRevision,
    deletedFiles: ['apps/extension/src/content/removed.ts'],
  });
  expect(calls).toEqual([
    ['merge-base', 'a'.repeat(40), 'HEAD'],
    [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      '--diff-filter=ACMRTD',
      `${comparisonRevision}..HEAD`,
    ],
  ]);
});

it('keeps an advanced base tip out of the candidate comparison tree', async () => {
  const root = createTempRoot('ci-candidate-advanced-base-');
  initGitRepo(root);
  writeFile(root, 'src/current.ts', 'export const current = 1;\n');
  writeFile(root, 'src/removed.ts', 'export const removed = 1;\n');
  runFixtureGit(root, 'add', '.');
  runFixtureGit(root, 'commit', '-m', 'common ancestor');
  const commonAncestor = gitOutput(root, 'rev-parse', 'HEAD');

  runFixtureGit(root, 'checkout', '-b', 'feature');
  writeFile(root, 'src/current.ts', 'export const current = 2;\n');
  fs.rmSync(`${root}/src/removed.ts`);
  runFixtureGit(root, 'add', '-A');
  runFixtureGit(root, 'commit', '-m', 'feature candidate');

  runFixtureGit(root, 'checkout', '-b', 'advanced-base', commonAncestor);
  writeFile(root, 'src/base-only.ts', 'export const baseOnly = true;\n');
  runFixtureGit(root, 'add', '.');
  runFixtureGit(root, 'commit', '-m', 'advance base');
  const advancedBase = gitOutput(root, 'rev-parse', 'HEAD');
  runFixtureGit(root, 'checkout', 'feature');

  const result = await withCwd(root, () =>
    resolveCiCandidateDiff({ environment: { SNIPTALE_BASE_SHA: advancedBase } })
  );

  expect(result).toMatchObject({
    available: true,
    candidateFiles: ['src/current.ts', 'src/removed.ts'],
    comparisonRevision: commonAncestor,
    deletedFiles: ['src/removed.ts'],
  });
});

it('allows an explicit periodic proof to force the full harness', () => {
  expect(
    resolveCiHarnessTestPlan(
      {},
      { environment: { SNIPTALE_CI_FULL_HARNESS: '1' }, gitRunner: vi.fn() }
    )
  ).toEqual({ full: true, relatedFiles: [], reason: 'explicit periodic/full proof' });
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
