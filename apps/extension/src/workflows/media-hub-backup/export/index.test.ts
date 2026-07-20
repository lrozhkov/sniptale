import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { MediaHubBackupManifest, MediaHubBackupMetadata } from '../contracts/types';

interface FakeZipArchive {
  __fakeZipFiles: Map<string, Blob | string>;
}

const { FakeJSZip, initDBMock, listMediaLibraryMock } = vi.hoisted(() => {
  class FakeZipFile {
    constructor(private readonly value: Blob | string) {}

    async async(): Promise<Blob | string> {
      return this.value;
    }
  }

  class FakeJSZip {
    private files = new Map<string, Blob | string>();

    static async loadAsync(input: unknown): Promise<FakeJSZip> {
      const files = (input as { __fakeZipFiles?: Map<string, Blob | string> } | null)
        ?.__fakeZipFiles;
      if (!files) {
        throw new Error(
          "Can't read the data of 'the loaded zip file'. Is it in a supported JavaScript type " +
            '(String, Blob, ArrayBuffer, etc) ?'
        );
      }

      const zip = new FakeJSZip();
      zip.files = new Map(files);
      return zip;
    }

    file(path: string, value?: Blob | string): FakeZipFile | FakeJSZip | null {
      if (value === undefined) {
        const existing = this.files.get(path);
        return existing === undefined ? null : new FakeZipFile(existing);
      }

      this.files.set(path, value);
      return this;
    }

    async generateAsync() {
      return {
        __fakeZipFiles: new Map(this.files),
      };
    }
  }

  return {
    FakeJSZip,
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

const mediaHubBackupModulePromise = import('.');

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

async function importMediaHubBackupModule() {
  return mediaHubBackupModulePromise;
}

function assertFakeZipArchive(value: unknown): asserts value is FakeZipArchive {
  expect(Object.getOwnPropertyDescriptor(value, '__fakeZipFiles')?.value).toBeInstanceOf(Map);
}

function setupExportDatabase(firstEntry: MediaLibraryEntry, secondEntry: MediaLibraryEntry): void {
  listMediaLibraryMock.mockResolvedValue([firstEntry, secondEntry]);
  initDBMock.mockResolvedValue({
    get: vi.fn(async (storeName: string, key: string) => {
      if (storeName === 'media_library' && key === firstEntry.id) {
        return firstEntry;
      }

      if (storeName === 'media_library' && key === secondEntry.id) {
        return secondEntry;
      }

      if (storeName === 'thumbnails' && key === 'asset-1') {
        return {
          assetId: 'asset-1',
          blob: new Blob(['thumb-1']),
        };
      }

      if (storeName === 'recordings' && key === 'recording-1') {
        return {
          blob: new Blob(['recording-1']),
        };
      }

      return undefined;
    }),
    getAll: vi.fn().mockResolvedValue([]),
    getAllFromIndex: vi.fn().mockResolvedValue([]),
  });
}

function expectExportedManifest(manifest: MediaHubBackupManifest): void {
  expect(manifest).toEqual(
    expect.objectContaining({
      assetCount: 2,
      effectBundleCount: 0,
      format: 'sniptale-media-hub-backup',
      thumbnailCount: 1,
      version: 4,
      videoProjectCount: 0,
      scenarioProjectCount: 0,
    })
  );
}

function expectExportedAssets(
  metadata: MediaHubBackupMetadata,
  firstEntryId: string,
  secondEntryId: string
): void {
  expect(metadata.assets).toEqual([
    expect.objectContaining({
      assetPath: 'assets/asset-1',
      entry: expect.objectContaining({ id: firstEntryId }),
      thumbnailPath: 'thumbnails/asset-1',
    }),
    expect.objectContaining({
      assetPath: 'assets/asset-2',
      entry: expect.objectContaining({ id: secondEntryId }),
      thumbnailPath: null,
    }),
  ]);
  expect(metadata.effectBundles).toEqual([]);
}

async function verifyExportMediaHubBackup(): Promise<void> {
  const firstEntry = createMediaEntry({ kind: 'screenshot' });
  const secondEntry = createMediaEntry(
    {
      kind: 'project-export',
      exportId: 'export-1',
      projectId: 'project-1',
      recordingId: 'recording-1',
    },
    {
      id: 'asset-2',
      kind: 'export',
    }
  );

  setupExportDatabase(firstEntry, secondEntry);

  const { exportMediaHubBackup } = await importMediaHubBackupModule();
  const archive = await exportMediaHubBackup();
  assertFakeZipArchive(archive);
  const manifest: MediaHubBackupManifest = JSON.parse(
    String(archive.__fakeZipFiles.get('manifest.json') ?? '')
  );
  const metadata: MediaHubBackupMetadata = JSON.parse(
    String(archive.__fakeZipFiles.get('metadata.json') ?? '')
  );

  expectExportedManifest(manifest);
  expectExportedAssets(metadata, firstEntry.id, secondEntry.id);
}

async function verifySkipsMissingMediaLibraryRows(): Promise<void> {
  const firstEntry = createMediaEntry({ kind: 'screenshot' });
  const secondEntry = createMediaEntry(
    {
      kind: 'project-export',
      exportId: 'export-1',
      projectId: 'project-1',
      recordingId: 'recording-1',
    },
    {
      id: 'asset-2',
      kind: 'export',
    }
  );

  listMediaLibraryMock.mockResolvedValue([firstEntry, secondEntry]);
  initDBMock.mockResolvedValue({
    get: vi.fn(async (storeName: string, key: string) => {
      if (storeName === 'media_library' && key === secondEntry.id) {
        return secondEntry;
      }

      if (storeName === 'recordings' && key === 'recording-1') {
        return {
          blob: new Blob(['recording-1']),
        };
      }

      return undefined;
    }),
    getAll: vi.fn().mockResolvedValue([]),
    getAllFromIndex: vi.fn().mockResolvedValue([]),
  });

  const { exportMediaHubBackup } = await importMediaHubBackupModule();
  const archive = await exportMediaHubBackup();
  assertFakeZipArchive(archive);
  const metadata: MediaHubBackupMetadata = JSON.parse(
    String(archive.__fakeZipFiles.get('metadata.json') ?? '')
  );

  expect(metadata.assets).toEqual([
    expect.objectContaining({
      assetPath: 'assets/asset-2',
      entry: expect.objectContaining({ id: secondEntry.id }),
      thumbnailPath: null,
    }),
  ]);
}

beforeEach(() => {
  initDBMock.mockReset();
  listMediaLibraryMock.mockReset();
  vi.restoreAllMocks();
});

describe('media hub backup export', () => {
  it('exports archive metadata from the current media library', verifyExportMediaHubBackup);

  it(
    'skips media library items whose backing entry is missing from storage',
    verifySkipsMissingMediaLibraryRows
  );
});
