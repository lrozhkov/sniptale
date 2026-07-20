import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbGetMock, dbPutMock, initDBMock, openCursorMock, transactionMock } = vi.hoisted(() => ({
  dbDeleteMock: vi.fn(),
  dbGetMock: vi.fn(),
  dbPutMock: vi.fn(),
  initDBMock: vi.fn(),
  openCursorMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  EDITOR_SESSIONS_STORE: 'editor_sessions',
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
    store: {
      index: vi.fn().mockReturnValue({
        openCursor: openCursorMock,
      }),
    },
  });
  initDBMock.mockResolvedValue({
    get: dbGetMock,
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
  });

  expect(transactionMock).toHaveBeenCalledWith('editor_sessions', 'readwrite');
  expect(IDBKeyRange.upperBound).toHaveBeenCalledWith(now - 30 * 24 * 60 * 60 * 1000);
  expect(expiredCursor.delete).toHaveBeenCalledTimes(1);
  expect(dbPutMock).toHaveBeenCalledWith('editor_sessions', {
    sessionId: 'session-1',
    document: createEditorDocument(),
    assetId: null,
    sourceUrl: null,
    sourceTitle: 'Draft title',
    createdAt: now,
    updatedAt: now,
    dirty: true,
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

async function verifyCleanupRunsAtMostOncePerWindow() {
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

  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(IDBKeyRange.upperBound).toHaveBeenCalledTimes(1);
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
    'editor_sessions',
    expect.objectContaining({
      sourceTitle: 'Draft title',
      sourceUrl: 'https://example.com/',
    })
  );
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
    'limits editor-session cleanup scans to one run per cleanup window',
    verifyCleanupRunsAtMostOncePerWindow
  );
  it(
    'sanitizes sensitive source URLs before saving drafts',
    verifySensitiveSourceUrlIsSanitizedBeforeSave
  );
});
