import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';

const retentionMocks = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  openDBMock: vi.fn(),
}));

vi.mock('idb', () => ({
  openDB: retentionMocks.openDBMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: retentionMocks.loggerWarnMock,
  }),
}));

function createEditorDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,QUJDRA==',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

function createDb(overrides?: { entries?: unknown[]; keys?: IDBValidKey[] }) {
  const entries = overrides?.entries ?? [];
  return {
    clear: vi.fn(),
    close: vi.fn(),
    count: vi.fn().mockResolvedValue(entries.length),
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue(entries),
    getAllKeys: vi
      .fn()
      .mockResolvedValue(
        overrides?.keys ??
          entries.map((entry) =>
            entry && typeof entry === 'object' && 'id' in entry ? String(entry.id) : ''
          )
      ),
    objectStoreNames: {
      contains: vi.fn().mockReturnValue(false),
    },
    put: vi.fn(),
  };
}

function createCountCapEntries() {
  return Array.from({ length: 12 }, (_value, index) => ({
    createdAt: index + 1,
    dataUrl: 'data:image/png;base64,MA==',
    document: null,
    id: `entry-${index}`,
    sourceFaviconUrl: null,
    title: '',
    url: '',
  }));
}

function createOversizedDocumentEntries() {
  const oversizedDocument = {
    ...createEditorDocument(),
    canvasJson: 'x'.repeat(50 * 1024 * 1024 + 1),
  };
  return [
    {
      createdAt: 1,
      dataUrl: 'data:image/png;base64,MA==',
      document: oversizedDocument,
      id: 'oversized-document-entry',
      sourceFaviconUrl: null,
      title: '',
      url: '',
    },
    {
      createdAt: 2,
      dataUrl: 'data:image/png;base64,MA==',
      document: null,
      id: 'fresh-entry',
      sourceFaviconUrl: null,
      title: '',
      url: '',
    },
  ];
}

function createDeleteDatabaseMock(outcome: 'blocked' | 'success') {
  return vi.fn(() => {
    const request = {
      error: null,
      onblocked: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onsuccess: null as (() => void) | null,
    };
    queueMicrotask(() => (outcome === 'success' ? request.onsuccess?.() : request.onblocked?.()));
    return request;
  });
}

async function importRetentionModule() {
  vi.resetModules();
  return import('./retention');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editor-bootstrap retention bounds', () => {
  it('purges oldest entries when retained payload count exceeds the cap', async () => {
    const db = createDb({ entries: createCountCapEntries() });
    retentionMocks.openDBMock.mockResolvedValue(db);
    const { purgeExpiredEditorBootstrapRetentionData } = await importRetentionModule();

    await expect(purgeExpiredEditorBootstrapRetentionData(100)).resolves.toBe(2);

    expect(db.delete).toHaveBeenCalledWith('payloads', 'entry-0');
    expect(db.delete).toHaveBeenCalledWith('payloads', 'entry-1');
    expect(db.delete).not.toHaveBeenCalledWith('payloads', 'entry-11');
  });

  it('counts nested document data toward the retained byte cap', async () => {
    const db = createDb({ entries: createOversizedDocumentEntries() });
    retentionMocks.openDBMock.mockResolvedValue(db);
    const { purgeExpiredEditorBootstrapRetentionData } = await importRetentionModule();

    await expect(purgeExpiredEditorBootstrapRetentionData(100)).resolves.toBe(1);

    expect(db.delete).toHaveBeenCalledWith('payloads', 'oversized-document-entry');
    expect(db.delete).not.toHaveBeenCalledWith('payloads', 'fresh-entry');
  });
});

describe('editor-bootstrap retention erasure', () => {
  it('deletes the editor bootstrap database and closes a cached handle during erasure', async () => {
    const db = createDb();
    const deleteDatabaseMock = createDeleteDatabaseMock('success');
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([]),
      deleteDatabase: deleteDatabaseMock,
    });
    retentionMocks.openDBMock.mockResolvedValue(db);
    const {
      eraseEditorBootstrapRetentionData,
      persistEditorBootstrapPayload,
      verifyEditorBootstrapRetentionEmpty,
    } = await importRetentionModule();

    await persistEditorBootstrapPayload({ dataUrl: 'data:image/png;base64,cGVyc2lzdGVk' });
    await eraseEditorBootstrapRetentionData();
    db.count.mockResolvedValue(0);

    expect(db.close).toHaveBeenCalledOnce();
    expect(deleteDatabaseMock).toHaveBeenCalledWith('sniptale-editor-bootstrap');
    await expect(verifyEditorBootstrapRetentionEmpty()).resolves.toBe(true);
  });

  it('fails erasure when editor bootstrap database deletion is blocked', async () => {
    const db = createDb();
    const deleteDatabaseMock = createDeleteDatabaseMock('blocked');
    vi.stubGlobal('indexedDB', { deleteDatabase: deleteDatabaseMock });
    retentionMocks.openDBMock.mockResolvedValue(db);
    const { eraseEditorBootstrapRetentionData, persistEditorBootstrapPayload } =
      await importRetentionModule();

    await persistEditorBootstrapPayload({ dataUrl: 'data:image/png;base64,cGVyc2lzdGVk' });

    await expect(eraseEditorBootstrapRetentionData()).rejects.toThrow('deletion was blocked');
  });
});
