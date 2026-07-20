import { beforeEach, expect, it, vi } from 'vitest';

const retentionCleanupMocks = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  openDBMock: vi.fn(),
}));

vi.mock('idb', () => ({
  openDB: retentionCleanupMocks.openDBMock,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: retentionCleanupMocks.blobToDataUrlMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: retentionCleanupMocks.loggerWarnMock,
  }),
}));

function createDb(entry: unknown, key: string) {
  return {
    delete: vi.fn(),
    getAll: vi.fn().mockResolvedValue([entry]),
    getAllKeys: vi.fn().mockResolvedValue([key]),
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

it('deletes invalid retained rows during cleanup instead of leaving corrupt bootstrap state', async () => {
  const db = createDb(
    {
      blob: 'not-a-blob',
      createdAt: 500_000,
      document: null,
      id: 'invalid-entry',
      sourceFaviconUrl: null,
      title: 'Invalid',
      url: 'https://invalid.test',
    },
    'invalid-entry'
  );
  retentionCleanupMocks.openDBMock.mockResolvedValue(db);
  const { persistEditorBootstrapPayload } = await importRetentionModule();

  await persistEditorBootstrapPayload({ dataUrl: 'data:image/png;base64,cGVyc2lzdGVk' });

  expect(db.delete).toHaveBeenCalledWith('payloads', 'invalid-entry');
  expect(retentionCleanupMocks.loggerWarnMock).toHaveBeenCalledWith(
    'Deleting invalid editor bootstrap payload from IndexedDB',
    { bootstrapId: 'invalid-entry' }
  );
});

it('deletes legacy blob retained rows during cleanup instead of converting them', async () => {
  const db = createDb(
    {
      blob: new Blob(['legacy'], { type: 'image/png' }),
      createdAt: 500_000,
      document: null,
      id: 'legacy-blob-entry',
      sourceFaviconUrl: null,
      title: 'Legacy blob',
      url: 'https://legacy.test',
    },
    'legacy-blob-entry'
  );
  retentionCleanupMocks.openDBMock.mockResolvedValue(db);
  const { persistEditorBootstrapPayload } = await importRetentionModule();

  await persistEditorBootstrapPayload({ dataUrl: 'data:image/png;base64,cGVyc2lzdGVk' });

  expect(db.delete).toHaveBeenCalledWith('payloads', 'legacy-blob-entry');
  expect(retentionCleanupMocks.blobToDataUrlMock).not.toHaveBeenCalled();
  expect(retentionCleanupMocks.loggerWarnMock).toHaveBeenCalledWith(
    'Deleting invalid editor bootstrap payload from IndexedDB',
    { bootstrapId: 'legacy-blob-entry' }
  );
});
