import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbGetAllMock, dbGetMock, dbPutMock, initDBMock, openCursorMock, transactionMock } =
  vi.hoisted(() => ({
    dbDeleteMock: vi.fn(),
    dbGetAllMock: vi.fn(),
    dbGetMock: vi.fn(),
    dbPutMock: vi.fn(),
    initDBMock: vi.fn(),
    openCursorMock: vi.fn(),
    transactionMock: vi.fn(),
  }));

vi.mock('../infrastructure/indexed-db/core', () => ({
  EDITOR_SESSIONS_STORE: 'editor_sessions',
  MEDIA_LIBRARY_STORE: 'media_library',
  initDB: initDBMock,
}));
import { type EditorDocument } from '../../../features/editor/document/types';

function createEditorDocument(): EditorDocument {
  return {
    version: 1,
    sourceImageData: 'data:image/png;base64,abc',
    sourceName: 'Source',
    sourceWidth: 100,
    sourceHeight: 80,
    canvasWidth: 100,
    canvasHeight: 80,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 100,
    sourceDisplayHeight: 80,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color',
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#000000',
      backgroundGradientAngle: 90,
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      layoutMode: 'fit-image',
      browserTitle: '',
      browserUrl: '',
    },
    canvasJson: '{"objects":[]}',
  } as EditorDocument;
}

function resetEditorSessionsDbMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  transactionMock.mockReturnValue({
    done: Promise.resolve(),
    objectStore: vi.fn((name: string) =>
      name === 'editor_sessions'
        ? { get: dbGetMock, put: dbPutMock }
        : { get: vi.fn().mockResolvedValue(undefined) }
    ),
    store: {
      index: vi.fn().mockReturnValue({
        openCursor: openCursorMock,
      }),
    },
  });
  initDBMock.mockResolvedValue({
    get: dbGetMock,
    getAll: dbGetAllMock,
    put: dbPutMock,
    transaction: transactionMock,
  });
}

function createCursorChain(ids: string[]) {
  const firstId = ids[0];
  if (!firstId) {
    throw new Error('Expected at least one editor session id');
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

async function verifySaveDraftFlowDropsInvalidExistingPayloads() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const now = 31 * 24 * 60 * 60 * 1000 + 5000;
  vi.spyOn(Date, 'now').mockReturnValue(now);
  dbGetMock.mockResolvedValueOnce({ sessionId: 'broken' });
  vi.stubGlobal('IDBKeyRange', {
    upperBound: vi.fn((value: number) => ({ bound: value })),
  });
  const expiredCursor = createCursorChain(['expired-session']);
  openCursorMock.mockResolvedValueOnce(expiredCursor);

  const { saveEditorSessionDraft } = await import('./index');

  await expect(
    saveEditorSessionDraft({
      sessionId: 'session-1',
      document: createEditorDocument(),
      sourceTitle: 'Draft title',
    })
  ).resolves.toEqual({
    sessionId: 'session-1',
    document: createEditorDocument(),
    assetId: null,
    sourceUrl: null,
    sourceTitle: 'Draft title',
    createdAt: now,
    updatedAt: now,
    dirty: true,
    lifecycle: {
      savedAt: null,
      storageClass: 'temporary',
      updatedAt: now,
    },
  });

  expect(transactionMock).toHaveBeenCalledWith(['editor_sessions', 'media_library'], 'readwrite');
  expect(IDBKeyRange.upperBound).not.toHaveBeenCalled();
  expect(expiredCursor.delete).not.toHaveBeenCalled();
  expect(dbPutMock).toHaveBeenCalledWith({
    sessionId: 'session-1',
    document: createEditorDocument(),
    assetId: null,
    sourceUrl: null,
    sourceTitle: 'Draft title',
    createdAt: now,
    updatedAt: now,
    dirty: true,
    lifecycle: {
      savedAt: null,
      storageClass: 'temporary',
      updatedAt: now,
    },
  });
  expect(warnSpy).toHaveBeenNthCalledWith(
    1,
    '[SharedEditorSessionsDb]',
    'Ignoring invalid editor session entry from IndexedDB',
    { sessionId: '***' }
  );
}

async function verifyInvalidDraftReadFallsBackToUndefined() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  dbGetMock.mockResolvedValueOnce({ sessionId: 'broken' });

  const { getEditorSessionDraft } = await import('./index');

  await expect(getEditorSessionDraft('session-1')).resolves.toBeUndefined();
  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedEditorSessionsDb]',
    'Ignoring invalid editor session entry from IndexedDB',
    { sessionId: '***' }
  );
}

async function verifyAutosaveDoesNotRunRetentionCleanup() {
  const now = 31 * 24 * 60 * 60 * 1000 + 5000;
  vi.spyOn(Date, 'now').mockReturnValue(now);
  dbGetMock.mockResolvedValue(undefined);
  vi.stubGlobal('IDBKeyRange', {
    upperBound: vi.fn((value: number) => ({ bound: value })),
  });
  openCursorMock.mockResolvedValue(null);

  const { saveEditorSessionDraft } = await import('./index');

  await saveEditorSessionDraft({
    sessionId: 'session-1',
    document: createEditorDocument(),
  });
  await saveEditorSessionDraft({
    sessionId: 'session-2',
    document: createEditorDocument(),
  });

  expect(transactionMock).toHaveBeenCalledTimes(2);
  expect(IDBKeyRange.upperBound).not.toHaveBeenCalled();
}

async function verifySensitiveSourceUrlIsSanitizedBeforeSave() {
  const now = 31 * 24 * 60 * 60 * 1000 + 5000;
  vi.spyOn(Date, 'now').mockReturnValue(now);
  dbGetMock.mockResolvedValue(undefined);
  vi.stubGlobal('IDBKeyRange', {
    upperBound: vi.fn((value: number) => ({ bound: value })),
  });
  openCursorMock.mockResolvedValue(null);

  const { saveEditorSessionDraft } = await import('./index');

  await saveEditorSessionDraft({
    sessionId: 'session-sensitive',
    document: createEditorDocument(),
    sourceTitle: 'Draft title',
    sourceUrl: 'https://user:pass@example.com/oauth/callback?code=secret#access_token=abc',
  });

  expect(dbPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceTitle: 'Draft title',
      sourceUrl: 'https://example.com/',
    })
  );
}

async function verifyExistingLifecycleAndListOrdering() {
  const document = createEditorDocument();
  dbGetMock.mockResolvedValueOnce({
    assetId: null,
    createdAt: 10,
    dirty: false,
    document,
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 20 },
    sessionId: 'session-existing',
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 20,
  });
  vi.spyOn(Date, 'now').mockReturnValue(30);
  const { listEditorSessionDrafts, saveEditorSessionDraft } = await import('./index');

  const saved = await saveEditorSessionDraft({
    document,
    dirty: false,
    sessionId: 'session-existing',
  });
  expect(saved).toEqual(
    expect.objectContaining({
      createdAt: 10,
      dirty: false,
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 30 },
    })
  );

  dbGetAllMock.mockResolvedValueOnce([
    saved,
    { ...saved, sessionId: 'session-newer', updatedAt: 40 },
    { sessionId: 'invalid' },
  ]);
  await expect(listEditorSessionDrafts()).resolves.toEqual([
    expect.objectContaining({ sessionId: 'session-newer' }),
    expect.objectContaining({ sessionId: 'session-existing' }),
  ]);
}

describe('editor-sessions-db', () => {
  beforeEach(resetEditorSessionsDbMocks);

  it(
    'drops invalid IndexedDB payloads before saving a new editor draft snapshot',
    verifySaveDraftFlowDropsInvalidExistingPayloads
  );
  it(
    'drops invalid persisted editor session drafts on read',
    verifyInvalidDraftReadFallsBackToUndefined
  );
  it(
    'does not run retention cleanup from the autosave writer',
    verifyAutosaveDoesNotRunRetentionCleanup
  );
  it(
    'sanitizes sensitive source URLs before saving drafts',
    verifySensitiveSourceUrlIsSanitizedBeforeSave
  );
  it(
    'updates existing lifecycle metadata and lists valid drafts newest first',
    verifyExistingLifecycleAndListOrdering
  );
});
