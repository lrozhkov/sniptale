import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbDeleteMock,
  dbGetAllMock,
  dbGetMock,
  dbPutMock,
  initDBMock,
  mediaDeleteMock,
  mediaPutMock,
  openCursorMock,
  transactionMock,
} = vi.hoisted(() => ({
  dbDeleteMock: vi.fn(),
  dbGetAllMock: vi.fn(),
  dbGetMock: vi.fn(),
  dbPutMock: vi.fn(),
  initDBMock: vi.fn(),
  mediaDeleteMock: vi.fn(),
  mediaPutMock: vi.fn(),
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

function createRecordingEntry(id = 'recording-1') {
  return {
    id,
    blob: new Blob(['video'], { type: 'video/webm' }),
    filename: `${id}.webm`,
    createdAt: 1000,
    size: 5,
  };
}

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
      put: storeName === 'media_library' ? mediaPutMock : dbPutMock,
    })),
  });
  initDBMock.mockResolvedValue({
    delete: dbDeleteMock,
    get: dbGetMock,
    getAll: dbGetAllMock,
    put: dbPutMock,
    transaction: transactionMock,
  });
  dbGetAllMock.mockResolvedValue([]);
}

async function verifySaveRecordingFlow() {
  const { saveRecording } = await import('./index');
  const blob = new Blob(['video'], { type: 'video/webm' });
  vi.spyOn(Date, 'now').mockReturnValue(1700);

  await saveRecording('recording-1', blob, 'capture.webm');

  expect(dbPutMock).toHaveBeenCalledWith({
    id: 'recording-1',
    blob,
    filename: 'capture.webm',
    createdAt: 1700,
    size: blob.size,
  });
  expect(mediaPutMock).toHaveBeenCalledWith({
    id: 'recording:recording-1',
    kind: 'recording',
    source: {
      kind: 'recording',
      recordingId: 'recording-1',
    },
    filename: 'capture.webm',
    originalFilename: 'capture.webm',
    createdAt: 1700,
    updatedAt: 1700,
    size: blob.size,
    mimeType: 'video/webm',
    width: null,
    height: null,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
  });
}

async function verifyAudioRecordingMediaEntryFlow() {
  const { saveRecording } = await import('./index');
  const blob = new Blob(['audio'], { type: 'audio/webm' });
  vi.spyOn(Date, 'now').mockReturnValue(1800);

  await saveRecording('recording-audio', blob, 'microphone.webm');

  expect(mediaPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'recording:recording-audio',
      kind: 'audio',
      mimeType: 'audio/webm',
      source: {
        kind: 'recording',
        recordingId: 'recording-audio',
      },
    })
  );
}

async function verifyInvalidReadValuesAreDropped() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  dbGetMock.mockResolvedValueOnce({ id: 'broken' });
  dbGetAllMock.mockResolvedValueOnce([createRecordingEntry('recording-1'), { id: 'broken' }]);

  const { getRecording, listRecordings } = await import('./index');

  await expect(getRecording('recording-1')).resolves.toBeUndefined();
  await expect(listRecordings()).resolves.toEqual([
    {
      id: 'recording-1',
      filename: 'recording-1.webm',
      createdAt: 1000,
      size: 5,
      mimeType: 'video/webm',
      duration: null,
      height: null,
      thumbnailId: 'recording:recording-1',
      width: null,
    },
  ]);

  expect(warnSpy).toHaveBeenNthCalledWith(
    1,
    '[SharedRecordingsDb]',
    'Ignoring invalid recording entry from IndexedDB',
    { recordingId: 'recording-1' }
  );
  expect(warnSpy).toHaveBeenNthCalledWith(
    2,
    '[SharedRecordingsDb]',
    'Dropped invalid recording entries from IndexedDB list',
    { invalidEntryCount: 1 }
  );
}

async function verifyValidRecordingReadsAndDeleteFlow() {
  const entry = createRecordingEntry('recording-2');
  dbGetMock.mockResolvedValueOnce(entry);

  const { deleteRecording, getRecording } = await import('./index');

  await expect(getRecording('recording-2')).resolves.toEqual(entry);

  await deleteRecording('recording-2');

  expect(transactionMock).toHaveBeenCalledWith(
    ['recordings', 'media_library', 'recording_telemetry'],
    'readwrite'
  );
  expect(dbDeleteMock).toHaveBeenCalledTimes(2);
  expect(dbDeleteMock).toHaveBeenCalledWith('recording-2');
  expect(mediaDeleteMock).toHaveBeenCalledWith('recording:recording-2');
}

async function verifyInvalidListRootWarning() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  dbGetAllMock.mockResolvedValueOnce({ broken: true });

  const { listRecordings } = await import('./index');

  await expect(listRecordings()).resolves.toEqual([]);

  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedRecordingsDb]',
    'Ignoring invalid recordings list root from IndexedDB'
  );
}

describe('recordings-db', () => {
  beforeEach(resetRecordingsDbMocks);

  it('persists recordings and mirrors them into the media library', verifySaveRecordingFlow);
  it('classifies audio-only recordings as audio media entries', verifyAudioRecordingMediaEntryFlow);
  it('drops invalid IndexedDB payloads when reading recordings', verifyInvalidReadValuesAreDropped);
  it(
    'returns valid recordings and deletes them from IndexedDB',
    verifyValidRecordingReadsAndDeleteFlow
  );
  it(
    'warns and returns an empty list for an invalid recordings root payload',
    verifyInvalidListRootWarning
  );
});
