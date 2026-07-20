import { expect, it } from 'vitest';

import {
  applyCaptureJobTransition,
  assertTransitionAllowed,
  createCaptureJobService,
  isTerminalState,
} from './service';
import type { CaptureJobStore } from './store';
import type { CaptureJobRecord } from './record';

function createFakeStore(): CaptureJobStore {
  const jobs = new Map<string, CaptureJobRecord>();
  return {
    async clear() {
      jobs.clear();
    },
    async create(job) {
      jobs.set(job.jobId, job);
      return job;
    },
    async hydrateForReconciliation() {
      return [...jobs.values()];
    },
    async read(jobId) {
      return jobs.get(jobId);
    },
    async remove(jobId) {
      jobs.delete(jobId);
    },
    async transition(jobId, update) {
      const current = jobs.get(jobId);
      if (!current) {
        throw new Error(`Capture job "${jobId}" was not found`);
      }
      const next = update(current);
      if (!next) {
        throw new Error(`Capture job "${jobId}" was invalid and was removed`);
      }
      jobs.set(jobId, next);
      return next;
    },
  };
}

it('applies capture job transitions without persistence dependencies', () => {
  const job: CaptureJobRecord = {
    jobId: 'capture-1',
    revision: 0,
    runtimeGeneration: 'runtime-1',
    state: 'created',
    tabId: 7,
    updatedAtEpochMs: 100,
  };

  const capturing = applyCaptureJobTransition({
    job,
    nextState: 'capturing',
    now: 200,
  });
  expect(capturing).toEqual(
    expect.objectContaining({ revision: 1, state: 'capturing', updatedAtEpochMs: 200 })
  );

  const failed = applyCaptureJobTransition({
    job: capturing,
    nextState: 'failed',
    now: 300,
    patch: { error: 'capture failed' },
  });
  expect(failed).toEqual(
    expect.objectContaining({
      error: 'capture failed',
      revision: 2,
      state: 'failed',
      terminalAtEpochMs: 300,
    })
  );
});

it('rejects invalid transitions and classifies terminal states', () => {
  expect(() => assertTransitionAllowed('completed', 'capturing')).toThrow(
    'Invalid capture job transition completed -> capturing'
  );
  expect(() => assertTransitionAllowed('capturing', 'capturing')).not.toThrow();
  expect(isTerminalState('completed')).toBe(true);
  expect(isTerminalState('capturing')).toBe(false);
});

it('runs capture job service operations with an injected store', async () => {
  const service = createCaptureJobService({
    now: () => 1_000,
    randomId: () => 'job-1',
    runtimeGeneration: 'runtime-1',
    store: createFakeStore(),
  });

  const created = await service.create(7);
  expect(created).toEqual(
    expect.objectContaining({
      jobId: 'capture-7-job-1',
      runtimeGeneration: 'runtime-1',
      state: 'created',
      tabId: 7,
    })
  );
  await service.transition(created.jobId, 'capturing');
  await expect(service.hasCurrentRuntimeActiveJobForTab(7)).resolves.toBe(true);

  await service.transition(created.jobId, 'rendering');
  await service.bindDownload(created.jobId, 42);
  await service.transition(created.jobId, 'completed');
  await expect(service.listActive()).resolves.toEqual([]);
  await service.remove(created.jobId);
  await expect(service.read(created.jobId)).resolves.toBeUndefined();
});
