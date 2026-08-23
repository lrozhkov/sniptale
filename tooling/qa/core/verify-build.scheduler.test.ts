import { expect, it, vi } from 'vitest';

import { resolveQaReleaseResourceProfile } from '../runtime/resource-profile.mjs';
import { collectScheduledBuildStepResults, runBuildLaneWorker } from './verify-build.scheduler.mjs';
import { resolveBuildTestScope } from './verify-build.scope.mjs';
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
          executionClass: 'bounded-concurrent',
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

it('runs a full-suite fallback after every prerequisite with the release resource profile', async () => {
  const startedLanes: string[] = [];
  const completedLanes: string[] = [];
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => {
    startedLanes.push(lane);
    await Promise.resolve();
    completedLanes.push(lane);
    return laneValue(lane);
  });
  const scheduler = vi.fn(runBoundedTasks);
  const saturatedProfile = {
    ...profile,
    cpuTokens: 12,
    memoryMiB: 15 * 1024,
    vitestMaxWorkers: 12,
  };

  const saturatedProfileResolver = vi.fn(() => saturatedProfile);
  const steps = await collectScheduledBuildStepResults(
    {
      buildScope: {
        staticScope: 'repo-wide',
        testScope: {
          detail: 'full-suite fallback',
          directTestFiles: [],
          executionClass: 'saturated-exclusive',
          fullSuite: true,
          relatedFiles: [],
          requireRelatedTests: true,
        },
      },
      context: { codeFiles: [], targetFiles: [] },
    },
    { saturatedProfileResolver, profile, scheduler, workerRunner }
  );

  expect(saturatedProfileResolver).toHaveBeenCalledOnce();
  expect(scheduler).toHaveBeenCalledTimes(2);
  expect(scheduler.mock.calls[0]?.[0].map(({ id }) => id)).not.toContain('tests');
  expect(scheduler.mock.calls[1]?.[0].map(({ id }) => id)).toEqual(['tests']);
  expect(scheduler.mock.calls[1]?.[0][0]).toMatchObject({
    cpuTokens: 12,
    exclusive: true,
    memoryMiB: 15 * 1024,
  });
  expect(scheduler.mock.calls[1]?.[1]).toEqual({ profile: saturatedProfile });
  expect(workerRunner).toHaveBeenCalledWith(
    expect.objectContaining({
      lane: 'tests',
      memoryMiB: 15 * 1024,
      vitestMaxWorkers: 12,
    })
  );
  expect(startedLanes.at(-1)).toBe('tests');
  expect(completedLanes.slice(0, -1).sort()).toEqual(['graph', 'security', 'static', 'typecheck']);
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
  expect(steps.find(({ label }) => label === 'Unit tests')?.detail).toContain(
    'budget=12cpu/15360MiB; profile=12cpu/15360MiB'
  );
  const testCall = workerRunner.mock.calls.find(([input]) => input.lane === 'tests');
  expect(testCall?.[0].buildScope.testScope).not.toHaveProperty('executionClass');
});

it('runs a real 198-input related scope in the saturated phase', async () => {
  const codeFiles = Array.from(
    { length: 198 },
    (_, index) => `apps/extension/src/popup/shell/scheduler-large/view-${index}.tsx`
  );
  const testScope = resolveBuildTestScope({
    targetFiles: codeFiles,
    codeFiles,
    repoCodeFiles: codeFiles,
    focusedScopeResolver: () => ({
      detail: 'owner scope exceeds direct budget',
      testFiles: [],
      verdict: 'defer-ambiguous-existing',
    }),
    ownerTestResolver: () => [],
  });
  const scheduler = vi.fn(runBoundedTasks);
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) =>
    lane === 'tests'
      ? {
          testSteps: [{ ...step('Unit tests'), detail: testScope.detail }, step('Test coverage')],
        }
      : laneValue(lane)
  );
  const saturatedProfile = {
    ...profile,
    cpuTokens: 12,
    memoryMiB: 15 * 1024,
    vitestMaxWorkers: 12,
  };

  const steps = await collectScheduledBuildStepResults(
    {
      buildScope: { staticScope: 'repo-wide', testScope },
      context: { codeFiles, targetFiles: codeFiles },
    },
    {
      saturatedProfileResolver: () => saturatedProfile,
      profile,
      scheduler,
      workerRunner,
    }
  );

  expect(testScope.fullSuite).toBe(false);
  expect(testScope.executionClass).toBe('saturated-exclusive');
  expect(scheduler).toHaveBeenCalledTimes(2);
  expect(scheduler.mock.calls[1]?.[0]).toEqual([
    expect.objectContaining({ id: 'tests', cpuTokens: 12, exclusive: true }),
  ]);
  expect(steps.find(({ label }) => label === 'Unit tests')?.detail).toContain(
    'selection=related-transitive; execution=saturated-exclusive; related-inputs=198; reason=related-input-threshold'
  );
  expect(steps.find(({ label }) => label === 'Unit tests')?.detail).toContain(
    'budget=12cpu/15360MiB'
  );
});

it('applies environment caps to the saturated resource phase', async () => {
  const constrainedProfile = resolveQaReleaseResourceProfile({
    cpuInfo: '',
    env: {
      SNIPTALE_QA_CPU_TOKENS: '6',
      SNIPTALE_QA_MEMORY_MIB: '8192',
      SNIPTALE_QA_VITEST_MAX_WORKERS: '3',
    },
    logicalCpuCount: 12,
    totalMemoryBytes: 16 * 1024 * 1024 * 1024,
  });
  const scheduler = vi.fn(runBoundedTasks);
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => laneValue(lane));

  await collectScheduledBuildStepResults(
    {
      buildScope: {
        staticScope: 'repo-wide',
        testScope: {
          detail: 'saturated related tests',
          directTestFiles: [],
          executionClass: 'saturated-exclusive',
          fullSuite: false,
          relatedFiles: ['src/example.ts'],
          requireRelatedTests: true,
        },
      },
      context: { codeFiles: [], targetFiles: [] },
    },
    {
      saturatedProfileResolver: () => constrainedProfile,
      profile,
      scheduler,
      workerRunner,
    }
  );

  expect(scheduler.mock.calls[1]?.[0][0]).toMatchObject({
    cpuTokens: 6,
    exclusive: true,
    memoryMiB: 8192,
  });
  expect(workerRunner).toHaveBeenCalledWith(
    expect.objectContaining({ lane: 'tests', memoryMiB: 8192, vitestMaxWorkers: 3 })
  );
});

it.each([
  ['missing', undefined],
  ['unknown', 'repository-parallel'],
])('fails closed for a %s build test execution class', async (_name, executionClass) => {
  const scheduler = vi.fn(runBoundedTasks);
  const testScope: Record<string, unknown> = {
    detail: 'invalid execution scope',
    directTestFiles: [],
    fullSuite: false,
    relatedFiles: [],
    requireRelatedTests: false,
  };
  if (executionClass !== undefined) testScope.executionClass = executionClass;

  await expect(
    collectScheduledBuildStepResults(
      {
        buildScope: { staticScope: 'repo-wide', testScope },
        context: { codeFiles: [], targetFiles: [] },
      },
      { profile, scheduler }
    )
  ).rejects.toThrow(/executionClass must be bounded-concurrent or saturated-exclusive/u);
  expect(scheduler).not.toHaveBeenCalled();
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
    typecheckCheckerCount: 4,
    vitestMaxWorkers: 2,
  });

  expect(value.testSteps.map(({ status }) => status)).toEqual(['skipped', 'skipped']);
});
