import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type {
  MediaHubBackupAssetDescriptor,
  MediaHubBackupManifest,
  MediaHubBackupMetadata,
} from '../contracts/types';

type FakeZipArchive = Blob & {
  __fakeZipFiles: Map<string, Blob | string>;
};

const { FakeJSZip, importMediaHubBackupAssetsMock } = vi.hoisted(() => {
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
  return { FakeJSZip, importMediaHubBackupAssetsMock: vi.fn() };
});

vi.mock('jszip', () => ({
  default: FakeJSZip,
}));

vi.mock(
  '../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<typeof import('jszip')>()),
    initDB: vi.fn(),
  })
);

vi.mock('../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/media-library/index')
  >()),
  listMediaLibrary: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../restore', () => ({
  appendBackupAssetDescriptor: vi.fn(),
  importMediaHubBackupAssets: importMediaHubBackupAssetsMock,
}));

function createMediaEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<Omit<MediaLibraryEntry, 'blob'>> = {}
): Omit<MediaLibraryEntry, 'blob'> {
  return {
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

async function createBackupArchive(): Promise<FakeZipArchive> {
  const zip = new FakeJSZip();
  const manifest: MediaHubBackupManifest = {
    assetCount: 1,
    exportedAt: '2026-03-22T12:00:00.000Z',
    format: 'sniptale-media-hub-backup',
    thumbnailCount: 0,
    effectBundleCount: 0,
    version: 4,
  };
  const metadata: MediaHubBackupMetadata = {
    assets: [
      {
        assetPath: 'assets/asset-1',
        entry: createMediaEntry({ kind: 'screenshot' }),
        thumbnailPath: null,
      } satisfies MediaHubBackupAssetDescriptor,
    ],
    effectBundles: [],
  };

  zip.file('manifest.json', JSON.stringify(manifest));
  zip.file('metadata.json', JSON.stringify(metadata));

  return zip.generateAsync();
}

async function importMediaHubBackupModule() {
  return import('..');
}

function createUuid(index: number): `${string}-${string}-${string}-${string}-${string}` {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function resetUuidSequence(randomUUIDSpy: ReturnType<typeof vi.spyOn>): void {
  let index = 0;
  randomUUIDSpy.mockImplementation(() => createUuid(++index));
}

function verifyDuplicateRemaps(
  remapEntryForDuplicate: (
    entry: Omit<MediaLibraryEntry, 'blob'>
  ) => Omit<MediaLibraryEntry, 'blob'>
): void {
  verifyScreenshotRemap(remapEntryForDuplicate);
  verifyRecordingRemap(remapEntryForDuplicate);
  verifyProjectExportRemap(remapEntryForDuplicate);
  verifyProjectAssetRemap(remapEntryForDuplicate);
}

function verifyScreenshotRemap(
  remapEntryForDuplicate: (
    entry: Omit<MediaLibraryEntry, 'blob'>
  ) => Omit<MediaLibraryEntry, 'blob'>
): void {
  expect(remapEntryForDuplicate(createMediaEntry({ kind: 'screenshot' }))).toEqual(
    expect.objectContaining({ id: createUuid(1) })
  );
}

function verifyRecordingRemap(
  remapEntryForDuplicate: (
    entry: Omit<MediaLibraryEntry, 'blob'>
  ) => Omit<MediaLibraryEntry, 'blob'>
): void {
  expect(
    remapEntryForDuplicate(
      createMediaEntry(
        { kind: 'recording', recordingId: 'recording-1' },
        { id: 'recording:recording-1', kind: 'video' }
      )
    )
  ).toEqual(
    expect.objectContaining({
      id: `recording:import-${createUuid(2)}`,
      source: {
        kind: 'recording',
        recordingId: `import-${createUuid(2)}`,
      },
    })
  );
}

function verifyProjectExportRemap(
  remapEntryForDuplicate: (
    entry: Omit<MediaLibraryEntry, 'blob'>
  ) => Omit<MediaLibraryEntry, 'blob'>
): void {
  expect(
    remapEntryForDuplicate(
      createMediaEntry(
        {
          kind: 'project-export',
          exportId: 'export-1',
          projectId: 'project-1',
          recordingId: 'recording-1',
        },
        { id: 'export:export-1', kind: 'export' }
      )
    )
  ).toEqual(
    expect.objectContaining({
      id: `export:${createUuid(4)}`,
      source: {
        exportId: createUuid(4),
        kind: 'project-export',
        projectId: 'project-1',
        recordingId: `import-${createUuid(3)}`,
      },
    })
  );
}

function verifyProjectAssetRemap(
  remapEntryForDuplicate: (
    entry: Omit<MediaLibraryEntry, 'blob'>
  ) => Omit<MediaLibraryEntry, 'blob'>
): void {
  expect(
    remapEntryForDuplicate(
      createMediaEntry(
        { kind: 'project-asset', projectAssetId: 'project-asset-1' },
        { id: 'project-asset:project-asset-1', kind: 'image' }
      )
    )
  ).toEqual(
    expect.objectContaining({
      id: `project-asset:import-${createUuid(5)}`,
      source: {
        kind: 'project-asset',
        projectAssetId: `import-${createUuid(5)}`,
      },
    })
  );
}

async function verifyImportMediaHubBackup(): Promise<void> {
  const archive = await createBackupArchive();
  const randomUUIDSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
  resetUuidSequence(randomUUIDSpy);
  importMediaHubBackupAssetsMock.mockResolvedValue({
    conflictsResolved: 1,
    imported: 2,
    skipped: 0,
  });

  const { importMediaHubBackup } = await importMediaHubBackupModule();
  const result = await importMediaHubBackup(archive, 'duplicate');

  expect(result).toEqual({
    conflictsResolved: 1,
    imported: 2,
    skipped: 0,
  });
  expect(importMediaHubBackupAssetsMock).toHaveBeenCalledTimes(1);

  const args = importMediaHubBackupAssetsMock.mock.calls[0]?.[0] as {
    remapEntryForDuplicate: (
      entry: Omit<MediaLibraryEntry, 'blob'>
    ) => Omit<MediaLibraryEntry, 'blob'>;
    strategy: string;
    zip: { file: (path: string) => unknown };
  };

  expect(args.strategy).toBe('duplicate');
  expect(typeof args.zip.file).toBe('function');
  resetUuidSequence(randomUUIDSpy);
  verifyDuplicateRemaps(args.remapEntryForDuplicate);
}

beforeEach(() => {
  importMediaHubBackupAssetsMock.mockReset();
  vi.restoreAllMocks();
});

describe('media hub backup import', () => {
  it('passes duplicate remapping callback through import flow', verifyImportMediaHubBackup);
});
