import { beforeEach, describe, expect, it, vi } from 'vitest';

const outboxMocks = vi.hoisted(() => ({
  initDB: vi.fn(),
  runMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: outboxMocks.initDB,
  STATE_MANAGER_STORE: 'state_manager',
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: outboxMocks.runMutation,
}));

import {
  createVideoRecordingCompletionOutboxRecord,
  parseVideoRecordingCompletionOutboxRecord,
  readVideoRecordingCompletionOutbox,
  removeVideoRecordingCompletionOutbox,
  updateVideoRecordingCompletionOutbox,
} from './completion-outbox';

const RESULT = {
  primaryRecordingId: 'recording-1-window-1',
  projectId: null,
  recordingId: 'recording-1',
};

function createHarness(initial: unknown) {
  let stored = initial;
  const store = {
    delete: vi.fn(async () => {
      stored = undefined;
    }),
    get: vi.fn(async () => stored),
    put: vi.fn(async (value: unknown) => {
      stored = value;
    }),
  };
  const transaction = {
    done: Promise.resolve(),
    objectStore: vi.fn(() => store),
  };
  const db = {
    get: vi.fn(async () => stored),
    transaction: vi.fn(() => transaction),
  };
  return { db, getStored: () => stored, store };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('video recording completion outbox', () => {
  it('parses only the exact versioned domain record', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700);
    const record = createVideoRecordingCompletionOutboxRecord(RESULT);

    expect(parseVideoRecordingCompletionOutboxRecord(record)).toEqual(RESULT);
    expect(parseVideoRecordingCompletionOutboxRecord({ ...record, key: 'other' })).toBeNull();
    expect(
      parseVideoRecordingCompletionOutboxRecord({
        ...record,
        value: { ...record.value, version: 2 },
      })
    ).toBeNull();
  });

  it('reads the pending exact result without repairing malformed state', async () => {
    const validHarness = createHarness(createVideoRecordingCompletionOutboxRecord(RESULT, 1_700));
    outboxMocks.initDB.mockResolvedValueOnce(validHarness.db);
    await expect(readVideoRecordingCompletionOutbox()).resolves.toEqual(RESULT);

    const malformedHarness = createHarness({ domain: 'wrong' });
    outboxMocks.initDB.mockResolvedValueOnce(malformedHarness.db);
    await expect(readVideoRecordingCompletionOutbox()).resolves.toBeNull();
    expect(malformedHarness.store.put).not.toHaveBeenCalled();
  });

  it('updates only the same recording tuple and preserves it on mismatch', async () => {
    const harness = createHarness(createVideoRecordingCompletionOutboxRecord(RESULT, 1_700));
    outboxMocks.runMutation.mockImplementation(
      (operation: (db: typeof harness.db) => Promise<unknown>) => operation(harness.db)
    );

    await updateVideoRecordingCompletionOutbox({ ...RESULT, projectId: 'project-1' });
    expect(parseVideoRecordingCompletionOutboxRecord(harness.getStored())).toEqual({
      ...RESULT,
      projectId: 'project-1',
    });

    await expect(
      updateVideoRecordingCompletionOutbox({ ...RESULT, recordingId: 'recording-2' })
    ).rejects.toThrow('exact video recording completion outbox');
    expect(parseVideoRecordingCompletionOutboxRecord(harness.getStored())).toEqual({
      ...RESULT,
      projectId: 'project-1',
    });
  });

  it('removes only the exact acknowledged tuple', async () => {
    const harness = createHarness(createVideoRecordingCompletionOutboxRecord(RESULT, 1_700));
    outboxMocks.runMutation.mockImplementation(
      (operation: (db: typeof harness.db) => Promise<unknown>) => operation(harness.db)
    );

    await expect(
      removeVideoRecordingCompletionOutbox({ ...RESULT, projectId: 'different-project' })
    ).resolves.toBe(false);
    expect(harness.store.delete).not.toHaveBeenCalled();

    await expect(removeVideoRecordingCompletionOutbox(RESULT)).resolves.toBe(true);
    expect(harness.getStored()).toBeUndefined();
  });
});
