import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import { createSizedBackupTestBlob } from './budget.test-support.ts';
import { MAX_BACKUP_ENTRY_BYTES } from '../../manifest';

const { FakeJSZip, generateAsyncMock, initDBMock, listMediaLibraryMock } = vi.hoisted(() => {
  class FakeJSZip {
    private files = new Map<string, Blob | string>();

    file(path: string, value?: Blob | string): FakeJSZip | null {
      if (value === undefined) {
        return this.files.has(path) ? this : null;
      }
      this.files.set(path, value);
      return this;
    }

    async generateAsync() {
      generateAsyncMock();
      return { __fakeZipFiles: new Map(this.files) };
    }
  }

  return {
    FakeJSZip,
    generateAsyncMock: vi.fn(),
    initDBMock: vi.fn(),
    listMediaLibraryMock: vi.fn(),
  };
});

vi.mock('jszip', () => ({ default: FakeJSZip }));

vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<typeof import('jszip')>()),
    PROJECT_ASSETS_STORE: 'project_assets',
    PROJECT_EXPORTS_STORE: 'project_exports',
    RECORDING_TELEMETRY_STORE: 'recording_telemetry',
    SCENARIO_ASSETS_STORE: 'scenario_assets',
    SCENARIO_EXPORTS_STORE: 'scenario_exports',
    SCENARIO_PROJECTS_STORE: 'scenario_projects',
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
    STORE_NAME: 'recordings',
    THUMBNAILS_STORE: 'thumbnails',
    VIDEO_PROJECTS_STORE: 'video_projects',
    initDB: initDBMock,
  })
);

vi.mock('../../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/media-library/index')
  >()),
  listMediaLibrary: listMediaLibraryMock,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createMediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    blob: new Blob(['asset']),
    createdAt: 10,
    duration: null,
    filename: 'asset.png',
    height: 1080,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 123,
    source: { kind: 'screenshot' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}

function createOversizedBlob(): Blob {
  return createSizedBackupTestBlob(MAX_BACKUP_ENTRY_BYTES + 1);
}

async function importMediaHubBackupModule() {
  return import('..');
}

beforeEach(() => {
  generateAsyncMock.mockReset();
  initDBMock.mockReset();
  listMediaLibraryMock.mockReset();
});

describe('media hub backup export blob boundaries', () => {
  it('rejects oversized standalone media assets before archive generation', async () => {
    const entry = createMediaEntry({
      blob: createOversizedBlob(),
      size: MAX_BACKUP_ENTRY_BYTES + 1,
    });
    listMediaLibraryMock.mockResolvedValue([entry]);
    initDBMock.mockResolvedValue({
      get: vi.fn(async () => entry),
      getAll: vi.fn().mockResolvedValue([]),
      getAllFromIndex: vi.fn().mockResolvedValue([]),
    });

    const { exportMediaHubBackup } = await importMediaHubBackupModule();

    await expect(exportMediaHubBackup()).rejects.toThrow(
      'Media hub backup entry exceeds byte budget'
    );
    expect(generateAsyncMock).not.toHaveBeenCalled();
  });

  it('rejects oversized thumbnails before archive generation', async () => {
    const entry = createMediaEntry();
    listMediaLibraryMock.mockResolvedValue([entry]);
    initDBMock.mockResolvedValue({
      get: vi.fn(async (storeName: string) =>
        storeName === 'media_library' ? entry : { assetId: entry.id, blob: createOversizedBlob() }
      ),
      getAll: vi.fn().mockResolvedValue([]),
      getAllFromIndex: vi.fn().mockResolvedValue([]),
    });

    const { exportMediaHubBackup } = await importMediaHubBackupModule();

    await expect(exportMediaHubBackup()).rejects.toThrow(
      'Media hub backup entry exceeds byte budget'
    );
    expect(generateAsyncMock).not.toHaveBeenCalled();
  });
});
