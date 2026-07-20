import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbGetAllMock, dbDeleteMock, initDBMock, mediaDeleteMock, openCursorMock, transactionMock } =
  vi.hoisted(() => ({
    dbDeleteMock: vi.fn(),
    dbGetAllMock: vi.fn(),
    initDBMock: vi.fn(),
    mediaDeleteMock: vi.fn(),
    openCursorMock: vi.fn(),
    transactionMock: vi.fn(),
  }));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_EXPORTS_STORE: 'project_exports',
  RECORDING_TELEMETRY_STORE: 'recording_telemetry',
  STORE_NAME: 'recordings',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: initDBMock,
}));

function resetRecordingsDbMocks() {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  transactionMock.mockReturnValue({
    done: Promise.resolve(),
    objectStore: vi.fn((storeName: string) => ({
      delete: storeName === 'media_library' ? mediaDeleteMock : dbDeleteMock,
      index: vi.fn().mockReturnValue({
        openCursor: openCursorMock,
      }),
    })),
  });
  initDBMock.mockResolvedValue({
    getAll: dbGetAllMock,
    transaction: transactionMock,
  });
  dbGetAllMock.mockResolvedValue([]);
}

function createCursorChain(ids: string[]) {
  const firstId = ids[0];
  if (!firstId) {
    throw new Error('Expected at least one recording id');
  }
  let cursorIndex = 0;

  const createCursor = (id: string) => ({
    delete: vi.fn().mockResolvedValue(undefined),
    continue: vi.fn().mockImplementation(async () => {
      cursorIndex += 1;
      const nextId = ids[cursorIndex];
      return nextId ? createCursor(nextId) : null;
    }),
    primaryKey: id,
  });

  return createCursor(firstId);
}

async function verifyCleanupOldRecordingsDeletesCursorMatches() {
  vi.stubGlobal('IDBKeyRange', {
    upperBound: vi.fn((value: number) => ({ bound: value })),
  });
  vi.spyOn(Date, 'now').mockReturnValue(9 * 24 * 60 * 60 * 1000);
  const firstCursor = createCursorChain(['old-1', 'old-2']);
  openCursorMock.mockResolvedValueOnce(firstCursor);

  const { cleanupOldRecordings } = await import('./index');

  await expect(cleanupOldRecordings(7)).resolves.toBe(2);
  expect(transactionMock).toHaveBeenCalledWith(
    ['recordings', 'media_library', 'recording_telemetry'],
    'readwrite'
  );
  expect(IDBKeyRange.upperBound).toHaveBeenCalledWith(2 * 24 * 60 * 60 * 1000);
  expect(mediaDeleteMock).toHaveBeenNthCalledWith(1, 'recording:old-1');
  expect(mediaDeleteMock).toHaveBeenNthCalledWith(2, 'recording:old-2');
  expect(firstCursor.delete).toHaveBeenCalledTimes(1);
}

async function verifyCleanupOldRecordingsPreservesReferencedRows() {
  vi.stubGlobal('IDBKeyRange', {
    upperBound: vi.fn((value: number) => ({ bound: value })),
  });
  vi.spyOn(Date, 'now').mockReturnValue(9 * 24 * 60 * 60 * 1000);
  dbGetAllMock
    .mockResolvedValueOnce([
      {
        id: 'export:export-1',
        source: {
          kind: 'project-export',
          exportId: 'export-1',
          projectId: 'project-1',
          recordingId: 'old-1',
        },
      },
    ])
    .mockResolvedValueOnce([{ id: 'export-1', recordingId: 'old-1' }])
    .mockResolvedValueOnce([
      {
        id: 'project-1',
        project: { assets: [], baseRecordingId: 'old-3', source: { kind: 'manual' } },
      },
    ]);
  const secondCursor = {
    continue: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    primaryKey: 'old-2',
  };
  const firstCursor = {
    continue: vi.fn().mockResolvedValue(secondCursor),
    delete: vi.fn().mockResolvedValue(undefined),
    primaryKey: 'old-1',
  };
  openCursorMock.mockResolvedValueOnce(firstCursor);

  const { cleanupOldRecordings } = await import('./index');

  await expect(cleanupOldRecordings(7)).resolves.toBe(1);
  expect(firstCursor.delete).not.toHaveBeenCalled();
  expect(secondCursor.delete).toHaveBeenCalledTimes(1);
  expect(mediaDeleteMock).toHaveBeenCalledWith('recording:old-2');
  expect(mediaDeleteMock).not.toHaveBeenCalledWith('recording:old-1');
}

async function verifyCleanupOldRecordingsSkipsMalformedReferenceRows() {
  vi.stubGlobal('IDBKeyRange', {
    upperBound: vi.fn((value: number) => ({ bound: value })),
  });
  vi.spyOn(Date, 'now').mockReturnValue(9 * 24 * 60 * 60 * 1000);
  dbGetAllMock
    .mockResolvedValueOnce([
      { source: { kind: 'recording', recordingId: 'old-1' } },
      { source: { kind: 'recording' } },
    ])
    .mockResolvedValueOnce([{ recordingId: 42 }])
    .mockResolvedValueOnce([
      { project: { assets: 'legacy-bad', source: { kind: 'manual' } } },
      null,
      { assets: [], baseRecordingId: 'old-3', source: { kind: 'manual' } },
    ]);
  const secondCursor = {
    continue: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    primaryKey: 'old-2',
  };
  const firstCursor = {
    continue: vi.fn().mockResolvedValue(secondCursor),
    delete: vi.fn().mockResolvedValue(undefined),
    primaryKey: 'old-1',
  };
  openCursorMock.mockResolvedValueOnce(firstCursor);

  const { cleanupOldRecordings } = await import('./index');

  await expect(cleanupOldRecordings(7)).resolves.toBe(1);
  expect(firstCursor.delete).not.toHaveBeenCalled();
  expect(secondCursor.delete).toHaveBeenCalledTimes(1);
  expect(mediaDeleteMock).toHaveBeenCalledWith('recording:old-2');
  expect(console.warn).toHaveBeenCalledWith(
    '[SharedRecordingsDb]',
    'Ignoring malformed recording cleanup reference rows',
    expect.objectContaining({ invalidReferenceCount: 3 })
  );
}

async function verifyCleanupOldRecordingsHandlesEmptyCursor() {
  vi.stubGlobal('IDBKeyRange', {
    upperBound: vi.fn((value: number) => ({ bound: value })),
  });
  openCursorMock.mockResolvedValueOnce(null);

  const { cleanupOldRecordings } = await import('./index');

  await expect(cleanupOldRecordings()).resolves.toBe(0);
}

async function verifyCleanupOldRecordingsReportsPartialDeleteFailures() {
  vi.stubGlobal('IDBKeyRange', {
    upperBound: vi.fn((value: number) => ({ bound: value })),
  });
  vi.spyOn(Date, 'now').mockReturnValue(9 * 24 * 60 * 60 * 1000);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failingCursor = {
    continue: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockRejectedValue(new Error('delete failed')),
    primaryKey: 'old-1',
  };
  openCursorMock.mockResolvedValueOnce(failingCursor);

  const { cleanupOldRecordings } = await import('./index');

  await expect(cleanupOldRecordings(7)).rejects.toThrow('delete failed');
  expect(errorSpy).toHaveBeenCalledWith(
    '[SharedRecordingsDb]',
    'Recording cleanup stopped after partial delete failure',
    expect.objectContaining({
      deletedCount: 0,
      failedRecordingId: 'old-1',
      maxAgeDays: 7,
    })
  );
}

describe('recordings-db cleanup', () => {
  beforeEach(resetRecordingsDbMocks);

  it(
    'cleans up old recordings via the createdAt cursor',
    verifyCleanupOldRecordingsDeletesCursorMatches
  );
  it(
    'preserves old recordings referenced by exports and projects',
    verifyCleanupOldRecordingsPreservesReferencedRows
  );
  it(
    'skips malformed reference rows during stale recording cleanup',
    verifyCleanupOldRecordingsSkipsMalformedReferenceRows
  );
  it('returns zero when the cleanup cursor is empty', verifyCleanupOldRecordingsHandlesEmptyCursor);
  it(
    'reports partial delete failures during stale recording cleanup',
    verifyCleanupOldRecordingsReportsPartialDeleteFailures
  );
});
