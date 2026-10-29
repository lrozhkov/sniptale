import { THUMBNAILS_STORE } from '../../../../composition/persistence/infrastructure/indexed-db/core.stores';
import { parseMediaThumbnailEntry } from '../../../../composition/persistence/media-library/read-guards';
import { encodePortableThumbnail } from '../root-codecs/media';
import type {
  ArchivePathAllocator,
  ArchiveObjectRef,
} from '../../../../composition/archive-transfer';
import { parseAssetRef, readAssetFile } from '../../../../composition/persistence/assets';
import type { ArchiveRootObjectSource } from '../export';
import { createInternalObjectSegments } from '../layout';

export interface InventoryDatabase {
  get(store: string, key: unknown): Promise<unknown>;
  getAll(store: string): Promise<unknown[]>;
  getAllFromIndex(store: string, index: string, key: unknown): Promise<unknown[]>;
}

export function createObjectCollector(rootLabel: string, paths: ArchivePathAllocator) {
  const objects: ArchiveRootObjectSource[] = [];
  const references: { ref: ArchiveObjectRef }[] = [];
  const addObjectDescriptor = (
    size: number,
    filename: string,
    mimeType: string,
    directory?: readonly string[]
  ): ArchiveObjectRef => {
    const objectId = `${rootLabel}-object-${String(references.length + 1).padStart(6, '0')}`;
    const ref: ArchiveObjectRef = {
      filename,
      mimeType: mimeType.split(';', 1)[0]!.trim().toLowerCase(),
      objectId,
      path: paths.reserve(
        directory ? [...directory, filename] : createInternalObjectSegments(objectId, filename)
      ),
      size,
    };
    references.push({ ref });
    return ref;
  };
  const addObject = (
    blob: Blob,
    filename: string,
    mimeType = blob.type || 'application/octet-stream',
    directory?: readonly string[]
  ) => {
    const ref = addObjectDescriptor(blob.size, filename, mimeType, directory);
    objects.push({ blob, ref });
    return ref.objectId;
  };
  return { addObject, addObjectDescriptor, objects, references };
}

export async function readInventoryAssetFile(
  db: Pick<InventoryDatabase, 'get'>,
  assetId: string,
  filename: string
) {
  const ref = parseAssetRef(await db.get('asset_refs', assetId));
  if (!ref) throw new Error(`Archive inventory asset reference is missing: ${assetId}.`);
  return readAssetFile(ref, filename);
}

export function createReadableAssetFilename(index: number, mimeType: string): string {
  const extension =
    (
      {
        'audio/mpeg': '.mp3',
        'audio/wav': '.wav',
        'audio/webm': '.webm',
        'image/gif': '.gif',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
      } as Record<string, string>
    )[mimeType.split(';', 1)[0]!.trim().toLowerCase()] ?? '';
  return `Asset ${String(index + 1).padStart(3, '0')}${extension}`;
}

export async function inventoryProjectThumbnail(
  db: Pick<InventoryDatabase, 'get'>,
  mediaId: string,
  projectId: string,
  collector: ReturnType<typeof createObjectCollector>
) {
  const stored = parseMediaThumbnailEntry(await db.get(THUMBNAILS_STORE, mediaId));
  return stored
    ? encodePortableThumbnail(
        stored,
        collector.addObject(stored.blob, `${projectId}-thumbnail`, stored.blob.type || 'image/png')
      )
    : undefined;
}
export function projectInventoryDescriptor<Kind extends 'scenario-project' | 'video-project'>(
  rootKind: Kind,
  rootId: string,
  metadataPath: string,
  objects: readonly { ref: ArchiveObjectRef }[]
) {
  return {
    metadataPath,
    objectCount: objects.length,
    rootId,
    rootKind,
    totalBytes: objects.reduce((sum, object) => sum + object.ref.size, 0),
  };
}
export function projectInventoryLoader(metadata: unknown, objects: ArchiveRootObjectSource[]) {
  return async () => ({ metadata: metadata as import('../contracts').JsonValue, objects });
}
