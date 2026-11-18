import {
  parseAssetRef,
  readAssetFile,
  type AssetRef,
} from '../../../../composition/persistence/assets';
import { readImageWorkspaceIdentity } from '../../../../composition/persistence/image-workspaces/identity';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  ASSET_REFS_STORE,
  IMAGE_WORKSPACE_IDENTITIES_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  STORE_NAME,
  VIDEO_WORKSPACES_STORE,
  initDB,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { sameMediaSource } from '../../../../composition/persistence/media-library/dependencies';
import { readImageSourceClaims } from '../../../../composition/persistence/media-library/deletion-index';
import {
  ROW_REFERENCE_INDEX,
  rowReferenceKey,
} from '../../../../composition/persistence/infrastructure/indexed-db/row-index-contract';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
} from '../../../../composition/persistence/projects/read-guards';
import { parseRecordingEntry } from '../../../../composition/persistence/recordings/index.guards';
import { assertMatchingArchiveAsset, assertMatchingArchiveBlobs } from './shared-project-media';

const ORIGINAL_CHANGED = 'Restored project original differs from the archive.';

interface LinkedSourceReader {
  objectStore(name: string): { get(key: string): Promise<unknown> };
}

interface LinkedClaimReader extends LinkedSourceReader {
  objectStore(name: string): ReturnType<LinkedSourceReader['objectStore']> & {
    index(name: string): { getAll(key: string, count?: number): Promise<unknown[]> };
  };
}

const linkedSourceStores = [
  MEDIA_LIBRARY_STORE,
  IMAGE_WORKSPACE_IDENTITIES_STORE,
  STORE_NAME,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  ASSET_REFS_STORE,
] as const;

async function readSourceAssetId(
  tx: LinkedSourceReader,
  source: NonNullable<ReturnType<typeof parseMediaLibraryEntry>>['source']
): Promise<string | undefined> {
  switch (source.kind) {
    case 'stored-asset':
      return source.assetId;
    case 'recording':
      return parseRecordingEntry(await tx.objectStore(STORE_NAME).get(source.recordingId))?.assetId;
    case 'project-asset':
      return parseProjectAssetEntry(
        await tx.objectStore(PROJECT_ASSETS_STORE).get(source.projectAssetId)
      )?.assetId;
    case 'project-export':
      return parseProjectExportEntry(
        await tx.objectStore(PROJECT_EXPORTS_STORE).get(source.exportId)
      )?.assetId;
    case 'screenshot':
      return undefined;
    case 'web-snapshot':
      throw new Error('Archived project uses an unsupported Library original.');
  }
}

async function readLinkedSource(tx: LinkedSourceReader, mediaId: string) {
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
  if (!media || media.id !== mediaId || media.lifecycle?.storageClass !== 'library')
    throw new Error('Archived project original is unavailable.');
  const image = media.kind === 'image' || media.kind === 'screenshot';
  const identity = image ? await readImageWorkspaceIdentity(tx, mediaId) : null;
  if (identity?.retired) throw new Error('Archived project original was deleted.');
  const id = await readSourceAssetId(tx, media.source);
  const asset = id ? parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(id)) : null;
  if (media.source.kind === 'screenshot' ? !media.blob : !asset || asset.assetId !== id)
    throw new Error('Archived project original bytes are unavailable.');
  return { media, asset, generation: identity?.generation ?? null };
}

export type LinkedProjectSource = Awaited<ReturnType<typeof readLinkedSource>>;

export async function hasLinkedEditorClaims(
  tx: LinkedClaimReader,
  media: LinkedProjectSource['media']
): Promise<boolean> {
  if (media.kind === 'image' || media.kind === 'screenshot') {
    const claims = await readImageSourceClaims(tx, media.id);
    return claims.linked || claims.unknown;
  }
  if (!media.mimeType.startsWith('video/')) return false;
  const candidates = await tx
    .objectStore(VIDEO_WORKSPACES_STORE)
    .index(ROW_REFERENCE_INDEX)
    .getAll(rowReferenceKey('media', media.id));
  return candidates.some(
    (row) =>
      !isRecord(row) || (row['sourceMediaId'] === media.id && row['aggregateId'] !== media.id)
  );
}

async function assertLinkedSourceBytes(args: {
  source: LinkedProjectSource;
  original: AssetRef;
  sourceKind: LinkedProjectSource['media']['source']['kind'];
  mediaKind: LinkedProjectSource['media']['kind'];
}): Promise<void> {
  const { source, original } = args;
  if (
    source.media.kind !== args.mediaKind ||
    source.media.source.kind !== args.sourceKind ||
    source.media.size !== original.size ||
    source.media.mimeType !== original.mimeType
  )
    throw new Error(ORIGINAL_CHANGED);
  if (source.asset) {
    await assertMatchingArchiveAsset(original, source.asset, ORIGINAL_CHANGED);
  } else if (source.media.blob) {
    const file = await readAssetFile(original, 'archived-original');
    await assertMatchingArchiveBlobs(file, source.media.blob, ORIGINAL_CHANGED);
  }
}

/** A source used by another editor can only be reused after exact byte verification. */
export async function prepareProtectedArchiveSource(
  db: Awaited<ReturnType<typeof initDB>>,
  args: Omit<Parameters<typeof assertLinkedSourceBytes>[0], 'source'> & { mediaId: string }
): Promise<LinkedProjectSource | null> {
  const tx = db.transaction(
    [...linkedSourceStores, IMAGE_WORKSPACES_STORE, VIDEO_WORKSPACES_STORE],
    'readonly'
  );
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(args.mediaId));
  const source =
    media && (await hasLinkedEditorClaims(tx, media))
      ? await readLinkedSource(tx, args.mediaId)
      : null;
  await tx.done;
  if (source) await assertLinkedSourceBytes({ ...args, source });
  return source;
}

/** A project can reuse the original selected by this restore only after checking its actual bytes. */
export async function prepareLinkedProjectSource(args: {
  archivedSourceId: string;
  roots: Readonly<Record<string, string>>;
  original: AssetRef;
  sourceKind: LinkedProjectSource['media']['source']['kind'];
  mediaKind: LinkedProjectSource['media']['kind'];
}): Promise<LinkedProjectSource> {
  const mediaId = args.roots[`media:library-item:${args.archivedSourceId}`];
  if (!mediaId) throw new Error('Archived project original is unresolved.');
  const db = await initDB();
  const tx = db.transaction([...linkedSourceStores], 'readonly');
  const source = await readLinkedSource(tx, mediaId);
  await tx.done;
  await assertLinkedSourceBytes({ ...args, source });
  return source;
}

/** Bind the result of the byte check to the current immutable ref or inline Image lifetime. */
export async function assertLinkedProjectSourceCurrent(
  tx: LinkedSourceReader,
  expected: LinkedProjectSource
): Promise<void> {
  const current = await readLinkedSource(tx, expected.media.id);
  if (
    !sameMediaSource(current.media.source, expected.media.source) ||
    current.media.createdAt !== expected.media.createdAt ||
    current.media.updatedAt !== expected.media.updatedAt ||
    current.media.originalSaveId !== expected.media.originalSaveId ||
    current.media.size !== expected.media.size ||
    current.media.mimeType !== expected.media.mimeType ||
    current.generation !== expected.generation ||
    JSON.stringify(current.asset) !== JSON.stringify(expected.asset)
  )
    throw new Error(ORIGINAL_CHANGED);
}
