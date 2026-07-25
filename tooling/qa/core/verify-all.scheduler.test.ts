import { expect, it, vi } from 'vitest';

import {
  collectScheduledFullVerifySteps,
  runFullVerifyLaneWorker,
} from './verify-all.scheduler.mjs';
import { runBoundedTasks } from '../runtime/task-scheduler.mjs';

function step(label: string) {
  return { label, status: 'ok' as const, detail: '', durationMs: 1 };
}

function laneValue(lane: string) {
  if (lane === 'appOwners') return { ownerStep: step('App-core owners') };
  if (lane === 'targetPaths') return { ownerStep: step('Target-only paths') };
  if (lane === 'light') {
    return {
      lineLengthStep: step('Changed-line readability'),
      oxlintStep: step('Oxlint'),
      aiHygieneStep: step('AI hygiene'),
      structuralRiskStep: step('Structural risk'),
      namingStep: step('Naming'),
      violationSteps: [step('Messaging'), step('App-core owners'), step('Target-only paths')],
      i18nStep: step('i18n'),
      designSystemStep: step('Design system'),
      auditStep: step('Audit'),
    };
  }
  if (lane === 'lint') {
    return {
      eslintStep: step('ESLint'),
      sonarjsStep: step('SonarJS'),
      securityStep: step('Security'),
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

it('keeps release result order while running the pre-build lanes concurrently', async () => {
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => laneValue(lane));
  const scheduler = vi.fn(runBoundedTasks);
  const steps = await collectScheduledFullVerifySteps(
    { releaseMode: true },
    { profile, scheduler, workerRunner }
  );

  expect(steps.map(({ label }) => label)).toEqual([
    'Changed-line readability',
    'Oxlint',
    'ESLint',
    'SonarJS',
    'AI hygiene',
    'Structural risk',
    'Naming',
    'Messaging',
    'App-core owners',
    'Target-only paths',
    'i18n',
    'Design system',
    'Audit',
    'Security',
    'Dependency boundaries',
    'Cycles',
    'Typecheck',
    'Dead exports',
    'Unit tests',
    'Test coverage',
  ]);
  expect(workerRunner).toHaveBeenCalledWith(
    expect.objectContaining({ lane: 'tests', vitestMaxWorkers: 4 })
  );
  const scheduledTasks = scheduler.mock.calls.flatMap(([tasks]) => tasks);
  expect(scheduledTasks?.find(({ id }) => id === 'lint')).toMatchObject({
    cpuTokens: 2,
    memoryMiB: 6144,
  });
  expect(scheduledTasks?.find(({ id }) => id === 'tests')).toMatchObject({
    cpuTokens: 8,
    exclusive: true,
    memoryMiB: 12 * 1024,
  });
});

it('executes a non-release test lane in a real worker without starting build', async () => {
  const value = await runFullVerifyLaneWorker({
    context: {
      baseline: { allowances: [] },
      codeFiles: [],
      releaseMode: false,
      targetFiles: [],
    },
    lane: 'tests',
    memoryMiB: 1024,
    vitestMaxWorkers: 2,
  });

  expect(value.testSteps.map(({ status }) => status)).toEqual(['skipped', 'skipped']);
});

it('runs release tests only after every non-test lane at the minimum profile', async () => {
  const startedLanes: string[] = [];
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => {
    startedLanes.push(lane);
    return laneValue(lane);
  });
  const scheduler = vi.fn(runBoundedTasks);

  await collectScheduledFullVerifySteps(
    { releaseMode: true },
    {
      profile: { ...profile, cpuTokens: 2, memoryMiB: 6144, vitestMaxWorkers: 2 },
      scheduler,
      workerRunner,
    }
  );

  expect(scheduler).toHaveBeenCalledTimes(2);
  expect(scheduler.mock.calls[0]?.[0].map(({ id }) => id)).not.toContain('tests');
  expect(scheduler.mock.calls[1]?.[0].map(({ id }) => id)).toEqual(['tests']);
  expect(startedLanes.at(-1)).toBe('tests');
});
