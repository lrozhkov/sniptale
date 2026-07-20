import { beforeEach, expect, it, vi } from 'vitest';

const retentionLegacyMocks = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  openDBMock: vi.fn(),
}));

vi.mock('idb', () => ({
  openDB: retentionLegacyMocks.openDBMock,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: retentionLegacyMocks.blobToDataUrlMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
  }),
}));

async function importRetentionModule() {
  vi.resetModules();
  return import('./retention');
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('rejects legacy blob-backed editor bootstrap payloads', async () => {
  const persistedBlob = new Blob(['editor'], { type: 'image/png' });
  const db = {
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue({
      blob: persistedBlob,
      createdAt: 4_000_000,
      document: null,
      id: 'bootstrap-id',
      sourceFaviconUrl: null,
      title: 'Legacy title',
      url: 'https://legacy.test',
    }),
  };
  retentionLegacyMocks.openDBMock.mockResolvedValue(db);
  retentionLegacyMocks.blobToDataUrlMock.mockResolvedValue('data:image/png;base64,bGVnYWN5');
  vi.spyOn(Date, 'now').mockReturnValue(4_100_000);

  const { consumePersistedEditorBootstrapPayload } = await importRetentionModule();

  await expect(consumePersistedEditorBootstrapPayload('bootstrap-id')).resolves.toBeNull();
  expect(retentionLegacyMocks.blobToDataUrlMock).not.toHaveBeenCalled();
  expect(db.delete).toHaveBeenCalledWith('payloads', 'bootstrap-id');
});
