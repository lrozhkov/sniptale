import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
  SaveWebSnapshotMediaAssetInput,
} from '../media-library/contracts';
import type { StoredWebSnapshotRecord } from './contracts';

export async function createWebSnapshotThumbnailEntry(args: {
  assetId: string;
  createdAt: number;
  screenshotBlob: Blob;
  updatedAt: number;
}): Promise<MediaThumbnailEntry> {
  const blob = await createImageThumbnailBlob(args.screenshotBlob, 320, 180, {
    verticalAnchor: 'top',
  });

  return {
    assetId: args.assetId,
    blob,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
    width: 320,
    height: 180,
  };
}

export async function createWebSnapshotMediaEntry(args: {
  assetId: string;
  input: SaveWebSnapshotMediaAssetInput;
  now: number;
  screenshotDimensions: { height: number; width: number };
  snapshot: StoredWebSnapshotRecord;
}): Promise<MediaLibraryEntry> {
  return {
    id: args.assetId,
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: args.snapshot.id },
    filename: args.input.filename,
    originalFilename: args.input.filename,
    createdAt: args.snapshot.createdAt,
    updatedAt: args.now,
    size: args.snapshot.size,
    mimeType: 'application/x-sniptale-web-snapshot+zip',
    width: args.screenshotDimensions.width,
    height: args.screenshotDimensions.height,
    duration: null,
    sourceUrl: sanitizeProvenanceUrl(args.input.sourceUrl ?? args.input.manifest.source.url),
    sourceTitle: args.input.sourceTitle ?? args.input.manifest.source.title,
    sourceFavicon: sanitizeProvenanceUrl(
      args.input.sourceFavicon ?? args.input.manifest.source.faviconUrl
    ),
    tags: args.input.tags ?? [],
  };
}
