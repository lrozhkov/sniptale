import { expect, it, vi } from 'vitest';

import {
  collectScheduledHarnessStepResults,
  createHarnessLaneTasks,
  runHarnessLaneWorker,
} from './scheduler.mjs';
import { runBoundedTasks } from '../../../runtime/scheduling/task-scheduler.mjs';

function step(label: string) {
  return { label, status: 'ok' as const, detail: '', durationMs: 1 };
}

const profile = {
  cpuTokens: 8,
  logicalCpuCount: 12,
  memoryMiB: 12 * 1024,
  physicalCoreCount: 6,
  totalMemoryMiB: 16 * 1024,
  vitestMaxWorkers: 4,
};

const context = {
  baseline: { allowances: [] },
  codeFiles: [],
  existingTargetFiles: [],
  harnessTargetFiles: [],
  jsLikeFiles: [],
  qualityCodeFiles: [],
  qualityJsLikeFiles: [],
};

function laneValue(lane: string) {
  if (lane === 'static') return { steps: [step('QA composition integrity')] };
  if (lane === 'typecheck') return { typecheckStep: step('Typecheck') };
  if (lane === 'oxlint') return { oxlintStep: step('Oxlint') };
  return { unitTestStep: step('Unit tests') };
}

it('uses the bounded profile and assembles canonical results independent of completion order', async () => {
  const workerRunner = vi.fn(async ({ lane }: { lane: string }) => laneValue(lane));
  const scheduler = vi.fn(runBoundedTasks);

  const steps = await collectScheduledHarnessStepResults(context, {
    profile,
    scheduler,
    workerRunner,
  });

  expect(steps.map(({ label }) => label)).toEqual([
    'QA composition integrity',
    'Typecheck',
    'Oxlint',
    'Unit tests',
  ]);
  expect(steps[0]?.detail).toContain('profile=8cpu/12288MiB');
  expect(workerRunner).toHaveBeenCalledWith(
    expect.objectContaining({ lane: 'tests', vitestMaxWorkers: 4 })
  );
  const tasks = scheduler.mock.calls[0]?.[0];
  expect(tasks?.map(({ id, cpuTokens, memoryMiB }) => ({ id, cpuTokens, memoryMiB }))).toEqual([
    { id: 'static', cpuTokens: 2, memoryMiB: 2048 },
    { id: 'typecheck', cpuTokens: 4, memoryMiB: 5120 },
    { id: 'oxlint', cpuTokens: 2, memoryMiB: 5120 },
    { id: 'tests', cpuTokens: 4, memoryMiB: 4096 },
  ]);
  expect(tasks?.find(({ id }) => id === 'oxlint')).toMatchObject({
    dependencies: ['typecheck'],
  });
});

it('adapts every lane to the smallest supported CPU profile', () => {
  expect(
    createHarnessLaneTasks({
      context,
      profile: { ...profile, cpuTokens: 1, vitestMaxWorkers: 1 },
    }).map(({ id, cpuTokens }) => ({ id, cpuTokens }))
  ).toEqual([
    { id: 'static', cpuTokens: 1 },
    { id: 'typecheck', cpuTokens: 1 },
    { id: 'oxlint', cpuTokens: 1 },
    { id: 'tests', cpuTokens: 1 },
  ]);
});

it('executes an empty test lane in a real child process', async () => {
  const value = await runHarnessLaneWorker({
    context,
    lane: 'tests',
    memoryMiB: 1024,
    typecheckCheckerCount: 4,
    vitestMaxWorkers: 2,
  });

  expect(value.unitTestStep).toMatchObject({ label: 'Unit tests', status: 'skipped' });
});
