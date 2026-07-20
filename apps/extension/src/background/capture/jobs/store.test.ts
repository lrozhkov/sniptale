import { expect, it } from 'vitest';

import { createStateManager } from '@sniptale/platform/data/state-manager';
import { createMemoryStateDomainAdapter } from '@sniptale/platform/data/state-manager/memory-adapter';
import { CAPTURE_JOB_DOMAIN, createStateManagerCaptureJobStore } from './store';
import type { CaptureJobRecord } from './record';

function createStore() {
  const stateManager = createStateManager();
  stateManager.registerDomain(CAPTURE_JOB_DOMAIN, {
    adapter: createMemoryStateDomainAdapter(),
  });
  return {
    stateManager,
    store: createStateManagerCaptureJobStore({ stateManager }),
  };
}

function createRecord(id: string): CaptureJobRecord {
  return {
    jobId: id,
    revision: 0,
    runtimeGeneration: 'runtime-1',
    state: 'created',
    tabId: 7,
    updatedAtEpochMs: 100,
  };
}

it('creates, reads, transitions, removes, and clears capture jobs', async () => {
  const { store } = createStore();
  const created = await store.create(createRecord('job-1'));

  await expect(store.read(created.jobId)).resolves.toEqual(created);
  await expect(
    store.transition(created.jobId, (job) => ({ ...job, revision: 1, state: 'capturing' }))
  ).resolves.toEqual(expect.objectContaining({ revision: 1, state: 'capturing' }));

  await store.remove(created.jobId);
  await expect(store.read(created.jobId)).resolves.toBeUndefined();

  await store.create(createRecord('job-2'));
  await store.clear();
  await expect(store.hydrateForReconciliation()).resolves.toEqual([]);
});

it('hydrates valid jobs and removes invalid records', async () => {
  const { stateManager, store } = createStore();
  await store.create(createRecord('job-1'));
  await stateManager.write(CAPTURE_JOB_DOMAIN, 'bad-job', {
    jobId: 'bad-job',
    revision: 0,
    state: 'bogus',
    tabId: 7,
    updatedAtEpochMs: 100,
  });

  await expect(store.hydrateForReconciliation()).resolves.toEqual([createRecord('job-1')]);
  await expect(stateManager.read(CAPTURE_JOB_DOMAIN, 'bad-job')).resolves.toBeUndefined();
});

it('fails when transitioning missing or invalid jobs', async () => {
  const { stateManager, store } = createStore();

  await expect(store.transition('missing-job', (job) => job)).rejects.toThrow(
    'Capture job "missing-job" was not found'
  );

  await stateManager.write(CAPTURE_JOB_DOMAIN, 'bad-job', {
    jobId: 'bad-job',
    revision: 0,
    state: 'bogus',
    tabId: 7,
    updatedAtEpochMs: 100,
  });
  await expect(store.transition('bad-job', (job) => job)).rejects.toThrow(
    'Capture job "bad-job" was invalid and was removed'
  );
});
