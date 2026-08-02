import { beforeEach, describe, expect, it, vi } from 'vitest';

const batchMocks = vi.hoisted(() => ({
  runMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  STATE_MANAGER_STORE: 'state_manager',
  STORE_NAME: 'recordings',
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: batchMocks.runMutation,
}));

function createTransactionHarness(failingRecordingId?: string, failOutbox = false) {
  const committedRecordingIds: string[] = [];
  const pendingRecordingIds: string[] = [];
  const pendingMediaIds: string[] = [];
  const pendingOutboxRecords: unknown[] = [];
  let resolveDone!: () => void;
  let rejectDone!: (error: unknown) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const abort = vi.fn(() => {
    pendingRecordingIds.length = 0;
    pendingMediaIds.length = 0;
    pendingOutboxRecords.length = 0;
    rejectDone(new Error('transaction aborted'));
  });
  const recordingPut = vi.fn(async (entry: { id: string }) => {
    if (entry.id === failingRecordingId) throw new Error(`put failed for ${entry.id}`);
    pendingRecordingIds.push(entry.id);
  });
  const mediaPut = vi.fn(async (entry: { id: string }) => {
    pendingMediaIds.push(entry.id);
  });
  const outboxAdd = vi.fn(async (entry: unknown) => {
    if (failOutbox) throw new Error('outbox add failed');
    pendingOutboxRecords.push(entry);
  });
  const transaction = {
    abort,
    done,
    objectStore: vi.fn((name: string) => ({
      add: outboxAdd,
      put: name === 'recordings' ? recordingPut : name === 'media_library' ? mediaPut : vi.fn(),
    })),
  };
  const db = {
    transaction: vi.fn().mockReturnValue(transaction),
  };
  return {
    abort,
    commit() {
      committedRecordingIds.push(...pendingRecordingIds);
      resolveDone();
    },
    committedRecordingIds,
    db,
    mediaPut,
    outboxAdd,
    recordingPut,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recording batch persistence', () => {
  it('commits every recording and matching media row through one transaction', async () => {
    const harness = createTransactionHarness();
    batchMocks.runMutation.mockImplementation(
      (operation: (db: typeof harness.db) => Promise<unknown>) => operation(harness.db)
    );
    vi.spyOn(Date, 'now').mockReturnValue(1_700);
    const { saveRecordingsBatch } = await import('./batch');
    const inputs = [
      { id: 'video-1', blob: new Blob(['video'], { type: 'video/webm' }), filename: '1.webm' },
      {
        id: 'audio-1',
        blob: new Blob(['audio'], { type: 'audio/webm' }),
        createdAt: 1_800,
        filename: '1-audio.webm',
      },
    ];

    const savePromise = saveRecordingsBatch(inputs);
    await vi.waitFor(() => expect(harness.mediaPut).toHaveBeenCalledTimes(2));
    harness.commit();
    const entries = await savePromise;

    expect(harness.db.transaction).toHaveBeenCalledWith(
      ['recordings', 'media_library'],
      'readwrite'
    );
    expect(entries).toEqual([
      { ...inputs[0], createdAt: 1_700, size: 5 },
      { ...inputs[1], size: 5 },
    ]);
    expect(harness.mediaPut).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'recording:video-1', kind: 'recording' })
    );
    expect(harness.mediaPut).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'recording:audio-1', kind: 'audio' })
    );
    expect(harness.committedRecordingIds).toEqual(['video-1', 'audio-1']);
    expect(harness.abort).not.toHaveBeenCalled();
  });

  it('aborts the transaction when recording N fails so no preceding row commits', async () => {
    const harness = createTransactionHarness('video-2');
    batchMocks.runMutation.mockImplementation(
      (operation: (db: typeof harness.db) => Promise<unknown>) => operation(harness.db)
    );
    const { saveRecordingsBatch } = await import('./batch');

    await expect(
      saveRecordingsBatch([
        { id: 'video-1', blob: new Blob(['one']), filename: '1.webm' },
        { id: 'video-2', blob: new Blob(['two']), filename: '2.webm' },
        { id: 'video-3', blob: new Blob(['three']), filename: '3.webm' },
      ])
    ).rejects.toThrow('put failed for video-2');

    expect(harness.recordingPut).toHaveBeenCalledTimes(2);
    expect(harness.mediaPut).toHaveBeenCalledTimes(1);
    expect(harness.abort).toHaveBeenCalledOnce();
    expect(harness.committedRecordingIds).toEqual([]);
  });

  it('commits the exact completion outbox in the same transaction as recording media', async () => {
    const harness = createTransactionHarness();
    batchMocks.runMutation.mockImplementation(
      (operation: (db: typeof harness.db) => Promise<unknown>) => operation(harness.db)
    );
    vi.spyOn(Date, 'now').mockReturnValue(1_700);
    const { saveRecordingsBatchWithCompletion } = await import('./batch');
    const completion = {
      primaryRecordingId: 'video-1',
      projectId: null,
      recordingId: 'session-1',
    };

    const savePromise = saveRecordingsBatchWithCompletion(
      [{ id: 'video-1', blob: new Blob(['video']), filename: '1.webm' }],
      completion
    );
    await vi.waitFor(() => expect(harness.outboxAdd).toHaveBeenCalledOnce());
    harness.commit();
    await expect(savePromise).resolves.toHaveLength(1);

    expect(harness.db.transaction).toHaveBeenCalledWith(
      ['recordings', 'media_library', 'state_manager'],
      'readwrite'
    );
    expect(harness.outboxAdd).toHaveBeenCalledWith({
      domain: 'video-recording-completion-outbox',
      key: 'pending',
      updatedAtEpochMs: 1_700,
      value: {
        primaryRecordingId: 'video-1',
        projectId: null,
        recordingId: 'session-1',
        version: 1,
      },
    });
  });

  it('aborts media rows when the completion outbox cannot join the transaction', async () => {
    const harness = createTransactionHarness(undefined, true);
    batchMocks.runMutation.mockImplementation(
      (operation: (db: typeof harness.db) => Promise<unknown>) => operation(harness.db)
    );
    const { saveRecordingsBatchWithCompletion } = await import('./batch');

    await expect(
      saveRecordingsBatchWithCompletion(
        [{ id: 'video-1', blob: new Blob(['video']), filename: '1.webm' }],
        { primaryRecordingId: 'video-1', projectId: null, recordingId: 'session-1' }
      )
    ).rejects.toThrow('outbox add failed');

    expect(harness.abort).toHaveBeenCalledOnce();
    expect(harness.committedRecordingIds).toEqual([]);
  });

  it('rejects duplicates before opening a transaction and treats an empty batch as a no-op', async () => {
    const { saveRecordingsBatch, saveRecordingsBatchWithCompletion } = await import('./batch');
    const blob = new Blob(['video']);

    await expect(saveRecordingsBatch([])).resolves.toEqual([]);
    await expect(
      saveRecordingsBatchWithCompletion([], {
        primaryRecordingId: 'missing',
        projectId: null,
        recordingId: 'session-1',
      })
    ).rejects.toThrow('primary completed recording');
    await expect(
      saveRecordingsBatch([
        { id: 'same', blob, filename: '1.webm' },
        { id: 'same', blob, filename: '2.webm' },
      ])
    ).rejects.toThrow('Duplicate recording ID');
    expect(batchMocks.runMutation).not.toHaveBeenCalled();
  });
});
