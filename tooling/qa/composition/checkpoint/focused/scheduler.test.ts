import { expect, it, vi } from 'vitest';

import { collectScheduledFocusedStepResults, runFocusedLaneWorker } from './scheduler.mjs';
import { runBoundedTasks } from '../../../runtime/scheduling/task-scheduler.mjs';

function step(label: string) {
  return { label, status: 'ok' as const, detail: '', durationMs: 1 };
}

function laneValue(lane: string) {
  if (lane === 'appOwners') return { ownerStep: step('App-core owners') };
  if (lane === 'targetPaths') return { ownerStep: step('Target-only paths') };
  if (lane === 'light') {
    return {
      qualitySteps: [step('Changed-line readability'), step('Dead commented code')],
      triggeredStaticSteps: [step('App-core owners'), step('Target-only paths')],
      policySteps: [step('Runtime topology')],
    };
  }
  if (lane === 'lint') {
    return {
      loggingStep: step('Logging policy'),
      oxlintStep: step('Oxlint'),
      securityStep: step('HTML sanitizer ownership'),
    };
  }
  if (lane === 'graph') {
    return {
      dependencySteps: [step('Dependency boundaries'), step('Cycles')],
      deadExportsStep: step('Dead exports'),
    };
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

it('assembles worker results in the canonical order rather than completion order', async () => {
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => laneValue(lane));
  const scheduler = vi.fn(runBoundedTasks);
  const result = await collectScheduledFocusedStepResults(
    { codeFiles: [], existingTargetFiles: [], jsLikeFiles: [], targetFiles: [] },
    { profile, scheduler, workerRunner }
  );

  expect(result.map(({ label }) => label)).toEqual([
    'Changed-line readability',
    'Dead commented code',
    'Oxlint',
    'Logging policy',
    'HTML sanitizer ownership',
    'Runtime topology',
    'App-core owners',
    'Target-only paths',
    'Dependency boundaries',
    'Cycles',
    'Dead exports',
    'Typecheck',
    'Unit tests',
    'Test coverage',
  ]);
  expect(workerRunner).toHaveBeenCalledWith(
    expect.objectContaining({ lane: 'tests', vitestMaxWorkers: 4 })
  );
  expect(result[0]?.detail).toContain('profile=8cpu/12288MiB');
  const scheduledTasks = scheduler.mock.calls[0]?.[0];
  expect(scheduledTasks?.find(({ id }) => id === 'typecheck')).toMatchObject({ cpuTokens: 2 });
});

it('executes the serializable no-test lane in a real worker', async () => {
  const value = await runFocusedLaneWorker({
    context: {
      addedFiles: [],
      baseline: { allowances: [] },
      codeFiles: [],
      existingTargetFiles: [],
      jsLikeFiles: [],
      qualityCodeFiles: [],
      qualityJsLikeFiles: [],
      qualityTargetFiles: [],
      shouldRunFullOxlint: false,
      shouldRunManifestPermissions: false,
      shouldRunRuntimeTopology: false,
      targetFiles: [],
    },
    lane: 'tests',
    memoryMiB: 1024,
    typecheckCheckerCount: 2,
    typecheckMaxConcurrency: 2,
    vitestMaxWorkers: 2,
  });

  expect(value.testSteps.map(({ status }) => status)).toEqual(['skipped', 'skipped']);
});

it('adapts typecheck concurrency and reservation to a one-token profile', async () => {
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => laneValue(lane));
  const scheduler = vi.fn(runBoundedTasks);
  await collectScheduledFocusedStepResults(
    {
      codeFiles: [],
      existingTargetFiles: [],
      jsLikeFiles: [],
      targetFiles: [],
    },
    {
      profile: { ...profile, cpuTokens: 1, memoryMiB: 6144, vitestMaxWorkers: 1 },
      scheduler,
      workerRunner,
    }
  );

  const scheduledTasks = scheduler.mock.calls[0]?.[0];
  expect(scheduledTasks?.find(({ id }) => id === 'typecheck')).toMatchObject({ cpuTokens: 1 });
  expect(scheduledTasks?.find(({ id }) => id === 'tests')).toMatchObject({ memoryMiB: 4096 });
  expect(workerRunner).toHaveBeenCalledWith(
    expect.objectContaining({
      lane: 'typecheck',
      typecheckCheckerCount: 1,
      typecheckMaxConcurrency: 1,
    })
  );
});

it('uses the release-proven lint budget without a false TypeScript dependency', async () => {
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => laneValue(lane));
  const scheduler = vi.fn(runBoundedTasks);
  await collectScheduledFocusedStepResults(
    {
      codeFiles: [],
      existingTargetFiles: [],
      jsLikeFiles: [],
      shouldRunFullOxlint: true,
      targetFiles: ['.oxlintrc.json'],
    },
    { profile, scheduler, workerRunner }
  );

  const scheduledTasks = scheduler.mock.calls[0]?.[0];
  expect(scheduledTasks?.find(({ id }) => id === 'lint')).toMatchObject({
    cpuTokens: 2,
    dependencies: [],
    memoryMiB: 6144,
  });
  expect(workerRunner).toHaveBeenCalledWith(
    expect.objectContaining({ lane: 'lint', memoryMiB: 6144 })
  );
});

it('preserves a separately scheduled rejection for a newly unclassified owner', async () => {
  const violation =
    'unclassified app-core owner: apps/extension/src/composition/new-owner/index.ts';
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => {
    if (lane !== 'appOwners') return laneValue(lane);
    return {
      ownerStep: {
        label: 'App-core owners',
        status: 'failed' as const,
        summary: 'App-core owner violations found',
        header: 'App-core owner violations found:',
        violations: [violation],
        durationMs: 1,
      },
    };
  });

  const result = await collectScheduledFocusedStepResults(
    { codeFiles: [], existingTargetFiles: [], jsLikeFiles: [], targetFiles: [] },
    { profile, workerRunner }
  );

  expect(result.filter(({ label }) => label === 'App-core owners')).toEqual([
    expect.objectContaining({ status: 'failed', violations: [violation] }),
  ]);
});
