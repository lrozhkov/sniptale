import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';

const retentionMocks = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  dataUrlToBlobMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  openDBMock: vi.fn(),
}));

vi.mock('idb', () => ({
  openDB: retentionMocks.openDBMock,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: retentionMocks.blobToDataUrlMock,
  dataUrlToBlob: retentionMocks.dataUrlToBlobMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: retentionMocks.loggerWarnMock,
  }),
}));

function createDbEntries() {
  return [
    {
      createdAt: 10,
      dataUrl: 'data:image/png;base64,ZXhwaXJlZA==',
      document: null,
      id: 'expired-entry',
      sourceFaviconUrl: null,
      title: 'Expired',
      url: 'https://expired.test',
    },
    {
      createdAt: 500_000,
      dataUrl: 'data:image/png;base64,ZnJlc2g=',
      document: null,
      id: 'fresh-entry',
      sourceFaviconUrl: 'https://fresh.test/favicon.ico',
      title: 'Fresh',
      url: 'https://fresh.test',
    },
  ];
}

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

function createDb(overrides?: {
  entries?: unknown[];
  keys?: IDBValidKey[];
  persistedEntry?: unknown;
}) {
  const entries = overrides?.entries ?? [];
  return {
    clear: vi.fn(),
    close: vi.fn(),
    count: vi.fn().mockResolvedValue(entries.length),
    delete: vi.fn(),
    get: vi
      .fn()
      .mockResolvedValue(
        overrides && 'persistedEntry' in overrides ? overrides.persistedEntry : undefined
      ),
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

async function importRetentionModule() {
  vi.resetModules();
  return import('./retention');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
});

describe('editor-bootstrap retention persist flow', () => {
  it('persists payloads and cleans up expired entries through the retention owner', async () => {
    const db = createDb({ entries: createDbEntries() });
    retentionMocks.openDBMock.mockImplementation(async (_name, _version, options) => {
      options?.upgrade?.({
        createObjectStore: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
      });
      return db;
    });
    const { persistEditorBootstrapPayload } = await importRetentionModule();
    vi.spyOn(Date, 'now').mockReturnValue(4_000_000);

    await expect(
      persistEditorBootstrapPayload({
        dataUrl: 'data:image/png;base64,cGVyc2lzdGVk',
        document: createEditorDocument(),
        sourceFaviconUrl: 'https://persisted.test/favicon.ico',
      })
    ).resolves.toBe('11111111-1111-4111-8111-111111111111');

    expect(retentionMocks.openDBMock).toHaveBeenCalledOnce();
    expect(db.getAll).toHaveBeenCalledWith('payloads');
    expect(db.getAllKeys).toHaveBeenCalledWith('payloads');
    expect(db.delete).toHaveBeenCalledWith('payloads', 'expired-entry');
    expect(db.delete).not.toHaveBeenCalledWith('payloads', 'fresh-entry');
    expect(db.put).toHaveBeenCalledWith('payloads', {
      createdAt: 4_000_000,
      dataUrl: 'data:image/png;base64,cGVyc2lzdGVk',
      document: createEditorDocument(),
      id: '11111111-1111-4111-8111-111111111111',
      sourceFaviconUrl: 'https://persisted.test/favicon.ico',
      title: '',
      url: '',
    });
  });
});

describe('editor-bootstrap retention active consume flow', () => {
  it('consumes active persisted payloads', async () => {
    const db = createDb({
      persistedEntry: {
        createdAt: 4_000_000,
        dataUrl: 'data:image/png;base64,cmVzdG9yZWQ=',
        document: createEditorDocument(),
        id: 'bootstrap-id',
        sourceFaviconUrl: 'https://persisted.test/favicon.ico',
        title: 'Persisted title',
        url: 'https://persisted.test',
      },
    });
    retentionMocks.openDBMock.mockResolvedValue(db);
    const { consumePersistedEditorBootstrapPayload } = await importRetentionModule();
    vi.spyOn(Date, 'now').mockReturnValue(4_100_000);

    await expect(consumePersistedEditorBootstrapPayload('bootstrap-id')).resolves.toEqual({
      dataUrl: 'data:image/png;base64,cmVzdG9yZWQ=',
      document: createEditorDocument(),
      sourceFaviconUrl: 'https://persisted.test/favicon.ico',
      title: 'Persisted title',
      url: 'https://persisted.test',
    });
    expect(db.get).toHaveBeenCalledWith('payloads', 'bootstrap-id');
    expect(db.delete).toHaveBeenCalledWith('payloads', 'bootstrap-id');
    expect(retentionMocks.blobToDataUrlMock).not.toHaveBeenCalled();
  });
});

describe('editor-bootstrap retention expired consume flow', () => {
  it('deletes expired persisted payloads instead of restoring them', async () => {
    const db = createDb({
      persistedEntry: {
        createdAt: 1,
        dataUrl: 'data:image/png;base64,ZXhwaXJlZA==',
        document: createEditorDocument(),
        id: 'expired-bootstrap',
        sourceFaviconUrl: null,
        title: 'Expired title',
        url: 'https://expired.test',
      },
    });
    retentionMocks.openDBMock.mockResolvedValue(db);
    const { consumePersistedEditorBootstrapPayload } = await importRetentionModule();
    vi.spyOn(Date, 'now').mockReturnValue(4_100_000);

    await expect(consumePersistedEditorBootstrapPayload('expired-bootstrap')).resolves.toBeNull();
    expect(db.delete).toHaveBeenCalledWith('payloads', 'expired-bootstrap');
    expect(retentionMocks.blobToDataUrlMock).not.toHaveBeenCalled();
  });
});

describe('editor-bootstrap retention invalid consume flow', () => {
  it('deletes invalid persisted payloads without returning them to the editor domain', async () => {
    const db = createDb({
      persistedEntry: {
        blob: new Blob(['editor'], { type: 'image/png' }),
        createdAt: 4_000_000,
        document: { version: 1, sourceImageData: 'not-a-data-url' },
        id: 'bootstrap-id',
        sourceFaviconUrl: null,
        title: 'Persisted title',
        url: 'https://persisted.test',
      },
    });
    retentionMocks.openDBMock.mockResolvedValue(db);
    const { consumePersistedEditorBootstrapPayload } = await importRetentionModule();
    vi.spyOn(Date, 'now').mockReturnValue(4_100_000);

    await expect(consumePersistedEditorBootstrapPayload('bootstrap-id')).resolves.toBeNull();
    expect(db.delete).toHaveBeenCalledWith('payloads', 'bootstrap-id');
    expect(retentionMocks.blobToDataUrlMock).not.toHaveBeenCalled();
    expect(retentionMocks.loggerWarnMock).toHaveBeenCalledWith(
      'Deleting invalid editor bootstrap payload from IndexedDB',
      { bootstrapId: 'bootstrap-id' }
    );
  });
});

describe('editor-bootstrap retention missing payloads', () => {
  it('returns null when the requested bootstrap payload is missing', async () => {
    const db = createDb();
    retentionMocks.openDBMock.mockResolvedValue(db);
    const { consumePersistedEditorBootstrapPayload } = await importRetentionModule();

    await expect(consumePersistedEditorBootstrapPayload('missing-bootstrap')).resolves.toBeNull();
    expect(db.get).toHaveBeenCalledWith('payloads', 'missing-bootstrap');
    expect(db.delete).not.toHaveBeenCalled();
    expect(retentionMocks.blobToDataUrlMock).not.toHaveBeenCalled();
  });
});
