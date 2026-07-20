import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { MediaHubBackupMetadata } from '../contracts/types';

export function createBoundedMemoryMediaEntry(
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

export function createMultiAssetBackupMetadata(
  entries: Omit<MediaLibraryEntry, 'blob'>[]
): MediaHubBackupMetadata {
  return {
    assets: entries.map((entry) => ({
      assetPath: `assets/${entry.id}`,
      entry,
      thumbnailPath: null,
    })),
    effectBundles: [],
  };
}
