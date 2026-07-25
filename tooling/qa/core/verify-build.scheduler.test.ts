import { expect, it, vi } from 'vitest';

import { collectScheduledBuildStepResults, runBuildLaneWorker } from './verify-build.scheduler.mjs';
import { runBoundedTasks } from '../runtime/task-scheduler.mjs';

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
  const scheduler = vi.fn(runBoundedTasks);
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
    { profile, scheduler, workerRunner }
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
  expect(scheduler).toHaveBeenCalledOnce();
  expect(scheduler.mock.calls[0]?.[0].find(({ id }) => id === 'tests')).toMatchObject({
    cpuTokens: 4,
    exclusive: false,
    memoryMiB: 4096,
  });
});

it('runs a full-suite fallback after other lanes with the release resource profile', async () => {
  const startedLanes: string[] = [];
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => {
    startedLanes.push(lane);
    return laneValue(lane);
  });
  const scheduler = vi.fn(runBoundedTasks);
  const fullSuiteProfile = {
    ...profile,
    cpuTokens: 12,
    memoryMiB: 15 * 1024,
    vitestMaxWorkers: 12,
  };

  const fullSuiteProfileResolver = vi.fn(() => fullSuiteProfile);
  const steps = await collectScheduledBuildStepResults(
    {
      buildScope: {
        staticScope: 'repo-wide',
        testScope: {
          detail: 'full-suite fallback',
          directTestFiles: [],
          fullSuite: true,
          relatedFiles: [],
          requireRelatedTests: true,
        },
      },
      context: { codeFiles: [], targetFiles: [] },
    },
    { fullSuiteProfileResolver, profile, scheduler, workerRunner }
  );

  expect(fullSuiteProfileResolver).toHaveBeenCalledOnce();
  expect(scheduler).toHaveBeenCalledTimes(2);
  expect(scheduler.mock.calls[0]?.[0].map(({ id }) => id)).not.toContain('tests');
  expect(scheduler.mock.calls[1]?.[0].map(({ id }) => id)).toEqual(['tests']);
  expect(scheduler.mock.calls[1]?.[0][0]).toMatchObject({
    cpuTokens: 12,
    exclusive: true,
    memoryMiB: 15 * 1024,
  });
  expect(scheduler.mock.calls[1]?.[1]).toEqual({ profile: fullSuiteProfile });
  expect(workerRunner).toHaveBeenCalledWith(
    expect.objectContaining({
      lane: 'tests',
      memoryMiB: 15 * 1024,
      vitestMaxWorkers: 12,
    })
  );
  expect(startedLanes.at(-1)).toBe('tests');
  expect(steps.find(({ label }) => label === 'Unit tests')?.detail).toContain(
    'budget=12cpu/15360MiB; profile=12cpu/15360MiB'
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
