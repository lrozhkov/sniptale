import { beforeEach, describe, expect, it, vi } from 'vitest';

type IndexedDbStateRecord = {
  domain: string;
  key: string;
  updatedAtEpochMs: number;
  value: unknown;
};

const dbMocks = vi.hoisted(() => {
  const records = new Map<string, IndexedDbStateRecord>();
  const keyFor = (domain: string, key: string) => `${domain}\u0000${key}`;

  return {
    db: {
      delete: vi.fn(async (_store: string, key: [string, string]) => {
        records.delete(keyFor(key[0], key[1]));
      }),
      get: vi.fn(async (_store: string, key: [string, string]) =>
        records.get(keyFor(key[0], key[1]))
      ),
      getAllFromIndex: vi.fn(async (_store: string, _indexName: string, domain: string) =>
        [...records.values()].filter((record) => record.domain === domain)
      ),
      put: vi.fn(async (_store: string, record: IndexedDbStateRecord) => {
        records.set(keyFor(record.domain, record.key), record);
      }),
    },
    records,
  };
});

vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', () => ({
  initDB: vi.fn(async () => dbMocks.db),
}));

import {
  CAPTURE_JOB_DOMAIN,
  bindDownloadToCaptureJob,
  clearCaptureJobsForTests,
  createCaptureJob,
  listActiveCaptureJobs,
  readCaptureJob,
  transitionCaptureJob,
} from './state-machine';
import { stateManager } from '../../../composition/persistence/infrastructure/state-manager';

beforeEach(async () => {
  dbMocks.records.clear();
  vi.clearAllMocks();
  await clearCaptureJobsForTests();
});

describe('CaptureJobStateMachine transitions', () => {
  it('persists capture job checkpoints and terminal state', async () => {
    const created = await createCaptureJob(7);
    expect(created.state).toBe('created');
    expect(created.revision).toBe(0);

    await transitionCaptureJob(created.jobId, 'capturing');
    await transitionCaptureJob(created.jobId, 'rendering');
    const completed = await transitionCaptureJob(created.jobId, 'completed');

    expect(completed.state).toBe('completed');
    expect(completed.revision).toBe(3);
    expect(completed.terminalAtEpochMs).toEqual(expect.any(Number));
    await expect(readCaptureJob(created.jobId)).resolves.toEqual(
      expect.objectContaining({ revision: 3, state: 'completed', tabId: 7 })
    );
  });

  it('rejects invalid transitions after terminal finalization', async () => {
    const created = await createCaptureJob(8);
    await transitionCaptureJob(created.jobId, 'failed', { error: 'capture failed' });

    await expect(transitionCaptureJob(created.jobId, 'capturing')).rejects.toThrow(
      'Invalid capture job transition failed -> capturing'
    );
  });

  it('binds download lifecycle to the capture job id', async () => {
    const created = await createCaptureJob(9);
    await transitionCaptureJob(created.jobId, 'capturing');
    await transitionCaptureJob(created.jobId, 'rendering');

    const exporting = await bindDownloadToCaptureJob(created.jobId, 42);

    expect(exporting).toEqual(expect.objectContaining({ downloadId: 42, state: 'exporting' }));
  });

  it('lists active jobs without terminal captures', async () => {
    const active = await createCaptureJob(11);
    const completed = await createCaptureJob(12);
    await transitionCaptureJob(active.jobId, 'capturing');
    await transitionCaptureJob(completed.jobId, 'failed', { error: 'capture failed' });

    await expect(listActiveCaptureJobs()).resolves.toEqual([
      expect.objectContaining({ jobId: active.jobId, state: 'capturing' }),
    ]);
  });
});

describe('CaptureJobStateMachine storage boundary', () => {
  it('hydrates capture checkpoints from the StateManager IndexedDB domain', async () => {
    const created = await createCaptureJob(10);
    await transitionCaptureJob(created.jobId, 'capturing');

    await expect(stateManager.hydrate(CAPTURE_JOB_DOMAIN)).resolves.toEqual({
      [created.jobId]: expect.objectContaining({
        jobId: created.jobId,
        revision: 1,
        state: 'capturing',
        tabId: 10,
      }),
    });
    expect(dbMocks.db.put).toHaveBeenCalled();
    expect(dbMocks.db.getAllFromIndex).toHaveBeenCalledWith(
      'state_manager',
      'domain',
      CAPTURE_JOB_DOMAIN
    );
  });

  it('rejects malformed persisted capture job values at the storage boundary', async () => {
    await stateManager.write(CAPTURE_JOB_DOMAIN, 'bad-job', {
      jobId: 'bad-job',
      revision: 0,
      state: 'bogus',
      tabId: 10,
      updatedAtEpochMs: Date.now(),
    });

    await expect(readCaptureJob('bad-job')).resolves.toBeUndefined();
    await expect(transitionCaptureJob('bad-job', 'failed')).rejects.toThrow(
      'Capture job "bad-job" was invalid and was removed'
    );
    await expect(readCaptureJob('bad-job')).resolves.toBeUndefined();
  });
});
