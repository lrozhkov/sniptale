import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
  SaveWebSnapshotMediaAssetInput,
} from '../media-library/contracts';
import type { WebSnapshotRecord } from './contracts';

export async function createWebSnapshotThumbnailEntry(args: {
  assetId: string;
  createdAt: number;
  screenshotBlob: Blob;
  updatedAt: number;
}): Promise<MediaThumbnailEntry> {
  const blob = await createImageThumbnailBlob(args.screenshotBlob);

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
  snapshot: WebSnapshotRecord;
}): Promise<MediaLibraryEntry> {
  const dimensions = await measureImageBlob(args.input.screenshotBlob);

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
    width: dimensions.width,
    height: dimensions.height,
    duration: null,
    sourceUrl: sanitizeProvenanceUrl(args.input.sourceUrl ?? args.input.manifest.source.url),
    sourceTitle: args.input.sourceTitle ?? args.input.manifest.source.title,
    sourceFavicon: sanitizeProvenanceUrl(
      args.input.sourceFavicon ?? args.input.manifest.source.faviconUrl
    ),
    tags: args.input.tags ?? [],
  };
}
