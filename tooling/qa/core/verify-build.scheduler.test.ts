import { expect, it, vi } from 'vitest';

import { collectScheduledBuildStepResults, runBuildLaneWorker } from './verify-build.scheduler.mjs';

function step(label: string) {
  return { label, status: 'ok' as const, detail: '', durationMs: 1 };
}

function laneValue(lane: string) {
  if (lane === 'static') {
    return {
      namingStep: step('Naming'),
      architectureStep: step('Architecture guardrails'),
      canonicalFacadeStep: step('Canonical facades'),
      rootSideEffectsStep: step('Root side effects'),
    };
  }
  if (lane === 'security') return { securityStep: step('Security') };
  if (lane === 'graph') {
    return { dependencySteps: [step('Dependency boundaries'), step('Cycles')] };
  }
  if (lane === 'typecheck') return { typecheckStep: step('Typecheck') };
  return { testSteps: [step('Unit tests'), step('Test coverage')] };
}

const profile = {
  cpuTokens: 8,
  logicalCpuCount: 12,
  memoryMiB: 12 * 1024,
  physicalCoreCount: 6,
  totalMemoryMiB: 16 * 1024,
  vitestMaxWorkers: 4,
};

it('keeps canonical build-step order while prerequisite lanes run concurrently', async () => {
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => laneValue(lane));
  const steps = await collectScheduledBuildStepResults(
    {
      buildScope: {
        staticScope: 'repo-wide',
        testScope: {
          detail: 'related tests',
          directTestFiles: [],
          fullSuite: false,
          relatedFiles: [],
          requireRelatedTests: false,
        },
      },
      context: { codeFiles: [], targetFiles: [] },
    },
    { profile, workerRunner }
  );

  expect(steps.map(({ label }) => label)).toEqual([
    'Naming',
    'Security',
    'Architecture guardrails',
    'Dependency boundaries',
    'Cycles',
    'Canonical facades',
    'Root side effects',
    'Typecheck',
    'Unit tests',
    'Test coverage',
  ]);
  expect(workerRunner).toHaveBeenCalledWith(
    expect.objectContaining({ lane: 'tests', vitestMaxWorkers: 4 })
  );
});

it('executes a build test lane in a real worker without starting Vite', async () => {
  const value = await runBuildLaneWorker({
    buildScope: {
      staticScope: 'repo-wide',
      testScope: {
        detail: 'no tests',
        directTestFiles: [],
        fullSuite: false,
        relatedFiles: [],
        requireRelatedTests: false,
      },
    },
    context: { codeFiles: [], targetFiles: [] },
    lane: 'tests',
    memoryMiB: 1024,
    vitestMaxWorkers: 2,
  });

  expect(value.testSteps.map(({ status }) => status)).toEqual(['skipped', 'skipped']);
});
