import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { MediaHubBackupAssetDescriptor, MediaHubBackupManifest } from '../contracts/types';

type FakeZipArchive = Blob & {
  __fakeZipFiles: Map<string, Blob | string>;
};

const {
  FakeJSZip,
  initDBMock,
  listMediaLibraryMock,
  listScenarioProjectsMock,
  listVideoProjectsMock,
} = vi.hoisted(() => {
  class FakeZipFile {
    readonly _data: { compressedSize: number; uncompressedSize: number };
    readonly dir = false;
    constructor(
      readonly name: string,
      private readonly value: Blob | string
    ) {
      const byteLength = typeof value === 'string' ? value.length : value.size;
      this._data = { compressedSize: byteLength, uncompressedSize: byteLength };
    }
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
        throw new Error('Unsupported zip');
      }
      const zip = new FakeJSZip();
      zip.files = new Map(files);
      return zip;
    }
    file(path: string, value?: Blob | string): FakeZipFile | FakeJSZip | null {
      if (value === undefined) {
        const existing = this.files.get(path);
        return existing === undefined ? null : new FakeZipFile(path, existing);
      }

      this.files.set(path, value);
      return this;
    }
    async generateAsync(): Promise<FakeZipArchive> {
      return Object.assign(new Blob(['zip']), {
        __fakeZipFiles: new Map(this.files),
      });
    }
  }
  return {
    FakeJSZip,
    initDBMock: vi.fn(),
    listMediaLibraryMock: vi.fn(),
    listScenarioProjectsMock: vi.fn(),
    listVideoProjectsMock: vi.fn(),
  };
});

vi.mock('jszip', () => ({
  default: FakeJSZip,
}));

vi.mock(
  '../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<typeof import('jszip')>()),
    initDB: initDBMock,
  })
);

vi.mock('../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/media-library/index')
  >()),
  listMediaLibrary: listMediaLibraryMock,
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  listVideoProjects: listVideoProjectsMock,
}));

vi.mock('../../../composition/persistence/scenario/store/project-records', () => ({
  createScenarioProjectRecord: vi.fn(),
  deleteScenarioProjectRecord: vi.fn(),
  getScenarioProjectRecord: vi.fn(),
  listScenarioProjectSummaries: listScenarioProjectsMock,
  renameScenarioProjectRecord: vi.fn(),
  saveScenarioProjectRecord: vi.fn(),
  updateScenarioProjectRecordMetadata: vi.fn(),
}));

vi.mock('../../../platform/i18n', () => ({
  AppLocale: {},
  DEFAULT_LOCALE: 'en',
  FALLBACK_LOCALE: 'en',
  SUPPORTED_LOCALES: ['en'],
  Translate: {},
  TranslationDictionary: {},
  TranslationKey: {},
  compareStrings: vi.fn((left: string, right: string) => left.localeCompare(right)),
  createTranslator: vi.fn(() => (key: string) => key),
  formatDateTime: vi.fn(),
  formatNumber: vi.fn(),
  getCurrentLocale: vi.fn(() => 'en'),
  getDictionary: vi.fn(() => ({})),
  getStoredLocalePreference: vi.fn(),
  setLocalePreference: vi.fn(),
  subscribeToLocaleChanges: vi.fn(() => vi.fn()),
  translate: (key: string) => key,
  useAppLocale: vi.fn(() => 'en'),
  usePageLocaleMetadata: vi.fn(),
}));

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

async function createBackupArchive(
  args: {
    assets?: MediaHubBackupAssetDescriptor[];
    manifest?: Partial<MediaHubBackupManifest>;
    metadata?: unknown;
    omitManifest?: boolean;
    omitMetadata?: boolean;
  } = {}
): Promise<FakeZipArchive> {
  const zip = new FakeJSZip();
  const assets = args.assets ?? [];

  if (!args.omitManifest) {
    zip.file(
      'manifest.json',
      JSON.stringify({
        assetCount: assets.length,
        exportedAt: '2026-03-22T12:00:00.000Z',
        format: 'sniptale-media-hub-backup',
        thumbnailCount: assets.filter((asset) => asset.thumbnailPath !== null).length,
        effectBundleCount: 0,
        version: 4,
        ...args.manifest,
      } satisfies MediaHubBackupManifest)
    );
  }

  if (!args.omitMetadata) {
    zip.file(
      'metadata.json',
      typeof args.metadata === 'string'
        ? args.metadata
        : JSON.stringify(args.metadata ?? { assets, effectBundles: [] })
    );
  }

  return zip.generateAsync();
}

async function importMediaHubBackupModule() {
  return import('..');
}

function createAssetDescriptor(
  entry: MediaLibraryEntry,
  thumbnailPath: string | null
): MediaHubBackupAssetDescriptor {
  const { blob: _blob, ...entryWithoutBlob } = entry;
  return {
    assetPath: `assets/${entry.id}`,
    entry: entryWithoutBlob,
    thumbnailPath,
  };
}

async function verifyInspectMediaHubBackup(): Promise<void> {
  listMediaLibraryMock.mockResolvedValue([
    createMediaEntry({ kind: 'screenshot' }),
    createMediaEntry({ kind: 'screenshot' }, { id: 'other-id' }),
  ]);
  listVideoProjectsMock.mockResolvedValue([{ id: 'video-project-1' }]);
  listScenarioProjectsMock.mockResolvedValue([{ id: 'scenario-1' }]);

  const archive = await createBackupArchive({
    assets: [
      createAssetDescriptor(createMediaEntry({ kind: 'screenshot' }), 'thumbnails/asset-1'),
      createAssetDescriptor(
        createMediaEntry(
          { kind: 'project-asset', projectAssetId: 'project-asset-1' },
          { id: 'asset-2', kind: 'image' }
        ),
        null
      ),
    ],
  });

  const { inspectMediaHubBackup } = await importMediaHubBackupModule();
  await expect(inspectMediaHubBackup(archive)).resolves.toEqual({
    assetCount: 2,
    conflicts: ['asset-1'],
    manifest: {
      assetCount: 2,
      exportedAt: '2026-03-22T12:00:00.000Z',
      format: 'sniptale-media-hub-backup',
      thumbnailCount: 1,
      effectBundleCount: 0,
      version: 4,
    },
    thumbnailCount: 1,
  });
}

beforeEach(() => {
  listMediaLibraryMock.mockReset();
  listScenarioProjectsMock.mockReset();
  listVideoProjectsMock.mockReset();
  listScenarioProjectsMock.mockResolvedValue([]);
  listVideoProjectsMock.mockResolvedValue([]);
  vi.restoreAllMocks();
});

describe('media hub backup inspect', () => {
  it('inspects backup conflicts and thumbnail count', verifyInspectMediaHubBackup);
});
