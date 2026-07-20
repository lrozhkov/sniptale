import { beforeEach, expect, it, vi } from 'vitest';

const retentionValidationMocks = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  openDBMock: vi.fn(),
}));

vi.mock('idb', () => ({
  openDB: retentionValidationMocks.openDBMock,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: retentionValidationMocks.blobToDataUrlMock,
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

function createOversizedImageDataUrl(): string {
  return `data:image/png;base64,${'A'.repeat(Math.ceil((25 * 1024 * 1024 * 4) / 3) + 256)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('rejects invalid image data before writing retained editor bootstrap rows', async () => {
  const db = { put: vi.fn() };
  retentionValidationMocks.openDBMock.mockResolvedValue(db);
  const { persistEditorBootstrapPayload } = await importRetentionModule();

  await expect(
    persistEditorBootstrapPayload({ dataUrl: 'data:text/html;base64,PGgxPmJvb208L2gxPg==' })
  ).rejects.toThrow('Invalid editor bootstrap image data');

  expect(retentionValidationMocks.openDBMock).not.toHaveBeenCalled();
  expect(db.put).not.toHaveBeenCalled();
});

it('rejects oversized image data before writing retained editor bootstrap rows', async () => {
  const db = { put: vi.fn() };
  retentionValidationMocks.openDBMock.mockResolvedValue(db);
  const { persistEditorBootstrapPayload } = await importRetentionModule();

  await expect(
    persistEditorBootstrapPayload({ dataUrl: createOversizedImageDataUrl() })
  ).rejects.toThrow('Invalid editor bootstrap image data');

  expect(retentionValidationMocks.openDBMock).not.toHaveBeenCalled();
  expect(db.put).not.toHaveBeenCalled();
});

it('deletes invalid data-url rows without returning them to the editor domain', async () => {
  const db = {
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue({
      createdAt: 4_000_000,
      dataUrl: 'data:text/html;base64,PGgxPmJvb208L2gxPg==',
      document: null,
      id: 'invalid-data-url',
      sourceFaviconUrl: null,
      title: 'Invalid data URL',
      url: 'https://persisted.test',
    }),
  };
  retentionValidationMocks.openDBMock.mockResolvedValue(db);
  vi.spyOn(Date, 'now').mockReturnValue(4_100_000);

  const { consumePersistedEditorBootstrapPayload } = await importRetentionModule();

  await expect(consumePersistedEditorBootstrapPayload('invalid-data-url')).resolves.toBeNull();
  expect(db.delete).toHaveBeenCalledWith('payloads', 'invalid-data-url');
  expect(retentionValidationMocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('deletes legacy blob rows before converting them to data URLs', async () => {
  const db = {
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue({
      blob: new Blob(['legacy'], { type: 'image/png' }),
      createdAt: 4_000_000,
      document: null,
      id: 'legacy-blob',
      sourceFaviconUrl: null,
      title: 'Legacy blob',
      url: 'https://persisted.test',
    }),
  };
  retentionValidationMocks.openDBMock.mockResolvedValue(db);
  vi.spyOn(Date, 'now').mockReturnValue(4_100_000);

  const { consumePersistedEditorBootstrapPayload } = await importRetentionModule();

  await expect(consumePersistedEditorBootstrapPayload('legacy-blob')).resolves.toBeNull();
  expect(db.delete).toHaveBeenCalledWith('payloads', 'legacy-blob');
  expect(retentionValidationMocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('rejects legacy blob rows even when conversion would have produced image data', async () => {
  const db = {
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue({
      blob: new Blob(['image'], { type: 'image/png' }),
      createdAt: 4_000_000,
      document: null,
      id: 'convertible-legacy-blob',
      sourceFaviconUrl: null,
      title: 'Convertible legacy blob',
      url: 'https://persisted.test',
    }),
  };
  retentionValidationMocks.openDBMock.mockResolvedValue(db);
  retentionValidationMocks.blobToDataUrlMock.mockResolvedValue('data:image/png;base64,aW1hZ2U=');
  vi.spyOn(Date, 'now').mockReturnValue(4_100_000);

  const { consumePersistedEditorBootstrapPayload } = await importRetentionModule();

  await expect(
    consumePersistedEditorBootstrapPayload('convertible-legacy-blob')
  ).resolves.toBeNull();
  expect(db.delete).toHaveBeenCalledWith('payloads', 'convertible-legacy-blob');
  expect(retentionValidationMocks.blobToDataUrlMock).not.toHaveBeenCalled();
});
