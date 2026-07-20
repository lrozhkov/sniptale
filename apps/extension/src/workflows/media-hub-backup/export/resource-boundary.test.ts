import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import { MAX_BACKUP_JSON_BYTES } from '../manifest';

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
      return new Blob(['zip']);
    }
  }

  return {
    FakeJSZip,
    generateAsyncMock: vi.fn(),
    initDBMock: vi.fn(),
    listMediaLibraryMock: vi.fn(),
  };
});

vi.mock('jszip', () => ({
  default: FakeJSZip,
}));

vi.mock(
  '../../../composition/persistence/infrastructure/indexed-db/core',
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

vi.mock('../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/media-library/index')
  >()),
  listMediaLibrary: listMediaLibraryMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

beforeEach(() => {
  generateAsyncMock.mockReset();
  initDBMock.mockReset();
  listMediaLibraryMock.mockReset();
  vi.restoreAllMocks();
});

describe('media hub backup export cancellation boundaries', () => {
  it('honors cancellation before archive assembly starts', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const { exportMediaHubBackup } = await import('.');
    await expect(exportMediaHubBackup({}, { signal: abortController.signal })).rejects.toThrow(
      'Media hub backup export was cancelled.'
    );
    expect(initDBMock).not.toHaveBeenCalled();
    expect(listMediaLibraryMock).not.toHaveBeenCalled();
    expect(generateAsyncMock).not.toHaveBeenCalled();
  });

  it('stops media asset assembly when cancellation happens mid-loop', async () => {
    const firstEntry = createMediaEntry({ kind: 'screenshot' });
    const secondEntry = createMediaEntry({ kind: 'screenshot' }, { id: 'asset-2' });
    const abortController = new AbortController();
    const get = createAbortingMediaLibraryGetter(firstEntry, secondEntry, abortController);

    listMediaLibraryMock.mockResolvedValue([firstEntry, secondEntry]);
    initDBMock.mockResolvedValue(createExportDbHarness(get));

    const { exportMediaHubBackup } = await import('.');
    await expect(exportMediaHubBackup({}, { signal: abortController.signal })).rejects.toThrow(
      'Media hub backup export was cancelled.'
    );
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('media_library', firstEntry.id);
    expect(generateAsyncMock).not.toHaveBeenCalled();
  });
});

describe('media hub backup export JSON boundaries', () => {
  it('rejects metadata JSON that the importer would reject', async () => {
    const entry = createMediaEntry(
      { kind: 'screenshot' },
      {
        filename: 'a'.repeat(MAX_BACKUP_JSON_BYTES + 1),
        originalFilename: 'a'.repeat(MAX_BACKUP_JSON_BYTES + 1),
      }
    );

    listMediaLibraryMock.mockResolvedValue([entry]);
    initDBMock.mockResolvedValue(
      createExportDbHarness(
        vi.fn(async (storeName: string, key: string) =>
          storeName === 'media_library' && key === entry.id ? entry : undefined
        )
      )
    );

    const { exportMediaHubBackup } = await import('.');
    await expect(exportMediaHubBackup()).rejects.toThrow(
      'Media hub backup JSON entry exceeds byte budget'
    );
    expect(generateAsyncMock).not.toHaveBeenCalled();
  });
});

function createAbortingMediaLibraryGetter(
  firstEntry: MediaLibraryEntry,
  secondEntry: MediaLibraryEntry,
  abortController: AbortController
) {
  return vi.fn(async (storeName: string, key: string) => {
    if (storeName === 'media_library' && key === firstEntry.id) {
      abortController.abort();
      return firstEntry;
    }
    if (storeName === 'media_library' && key === secondEntry.id) {
      return secondEntry;
    }
    return undefined;
  });
}

function createExportDbHarness(get: ReturnType<typeof vi.fn>) {
  return {
    get,
    getAll: vi.fn().mockResolvedValue([]),
    getAllFromIndex: vi.fn().mockResolvedValue([]),
  };
}

function createMediaEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<MediaLibraryEntry> = {}
): MediaLibraryEntry {
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
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}
