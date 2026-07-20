import type JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { BackupArchiveReader } from './index';

const { getMediaLibraryEntryMock } = vi.hoisted(() => ({
  getMediaLibraryEntryMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/media-library/index')
  >()),
  getMediaLibraryEntry: getMediaLibraryEntryMock,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
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

function createZip(
  args: {
    assetBlob?: Blob | null;
    thumbnailBlob?: Blob | null;
  } = {}
): BackupArchiveReader {
  const assetBlob = 'assetBlob' in args ? args.assetBlob : new Blob(['asset']);
  const thumbnailBlob = 'thumbnailBlob' in args ? args.thumbnailBlob : new Blob(['thumb']);

  return {
    file: vi.fn((path: string) => {
      if (path === 'assets/asset-1') {
        return assetBlob === null ? null : createZipObject(assetBlob);
      }

      if (path === 'thumbnails/asset-1') {
        return thumbnailBlob === null ? null : createZipObject(thumbnailBlob);
      }

      return null;
    }),
  };
}

function createZipObject(blob: Blob): JSZip.JSZipObject {
  return {
    async: vi.fn().mockResolvedValue(blob),
    comment: '',
    date: new Date(0),
    dir: false,
    dosPermissions: null,
    name: 'entry',
    nodeStream: vi.fn(),
    options: { compression: 'STORE' },
    unixPermissions: null,
  };
}

class SizedBlob extends Blob {
  constructor(private readonly byteSize: number) {
    super(['']);
  }

  override get size(): number {
    return this.byteSize;
  }
}

function createBackupAsset(entry: Omit<MediaLibraryEntry, 'blob'>) {
  return {
    assetPath: 'assets/asset-1',
    entry,
    thumbnailPath: 'thumbnails/asset-1',
  };
}

beforeEach(() => {
  getMediaLibraryEntryMock.mockReset();
});

it('skips conflicting assets when the import strategy is skip', async () => {
  const { prepareBackupImportAsset } = await import('.');

  getMediaLibraryEntryMock.mockResolvedValue(createMediaEntry({ kind: 'screenshot' }));

  await expect(
    prepareBackupImportAsset({
      asset: createBackupAsset(createMediaEntry({ kind: 'screenshot' })),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'skip',
      zip: createZip(),
    })
  ).resolves.toEqual({
    prepared: null,
    resolvedConflict: false,
  });
});

it('prepares duplicate imports with remapped ids and archive descriptors', async () => {
  const { prepareBackupImportAsset } = await import('.');
  const remappedEntry = createMediaEntry(
    { kind: 'project-asset', projectAssetId: 'project-asset-imported' },
    { id: 'project-asset:project-asset-imported', kind: 'image' }
  );
  const remapEntryForDuplicate = vi.fn().mockReturnValue(remappedEntry);

  getMediaLibraryEntryMock.mockResolvedValue(createMediaEntry({ kind: 'screenshot' }));

  await expect(
    prepareBackupImportAsset({
      asset: createBackupAsset(
        createMediaEntry(
          { kind: 'project-asset', projectAssetId: 'project-asset-1' },
          { id: 'project-asset:project-asset-1', kind: 'image' }
        )
      ),
      remapEntryForDuplicate,
      strategy: 'duplicate',
      zip: createZip(),
    })
  ).resolves.toEqual(
    expect.objectContaining({
      prepared: expect.objectContaining({
        assetPath: 'assets/asset-1',
        nextEntry: remappedEntry,
        thumbnailPath: 'thumbnails/asset-1',
      }),
      resolvedConflict: true,
    })
  );
});

it('fails preflight when the archive asset blob is missing', async () => {
  const { assertBackupImportAssetEntriesAvailable, prepareBackupImportAsset } = await import('.');

  getMediaLibraryEntryMock.mockResolvedValue(undefined);

  const { prepared } = await prepareBackupImportAsset({
    asset: createBackupAsset(createMediaEntry({ kind: 'screenshot' })),
    remapEntryForDuplicate: vi.fn(),
    strategy: 'replace',
    zip: createZip({ assetBlob: null }),
  });

  expect(() =>
    assertBackupImportAssetEntriesAvailable(
      prepared ? [prepared] : [],
      createZip({ assetBlob: null })
    )
  ).toThrow('shared.mediaHub.backupAssetBlobMissingPrefix asset.png.');
});

it('rejects oversized archive blobs when loading a write batch', async () => {
  const { loadBackupImportAssetBatch, prepareBackupImportAsset } = await import('.');

  getMediaLibraryEntryMock.mockResolvedValue(undefined);

  const { prepared } = await prepareBackupImportAsset({
    asset: createBackupAsset(createMediaEntry({ kind: 'screenshot' })),
    remapEntryForDuplicate: vi.fn(),
    strategy: 'replace',
    zip: createZip({ assetBlob: new SizedBlob(251 * 1024 * 1024) }),
  });

  await expect(
    loadBackupImportAssetBatch({
      preparedAssets: prepared ? [prepared] : [],
      zip: createZip({ assetBlob: new SizedBlob(251 * 1024 * 1024) }),
    })
  ).rejects.toThrow('shared.mediaHub.backupReadFailedPrefix asset.png.');
});
