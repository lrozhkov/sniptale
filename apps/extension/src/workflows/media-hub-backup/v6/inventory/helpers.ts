import type { ArchivePathAllocator } from '../../../../composition/archive-transfer';
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
  const addObject = (
    blob: Blob,
    filename: string,
    mimeType = blob.type || 'application/octet-stream',
    directory?: readonly string[]
  ) => {
    const objectId = `${rootLabel}-object-${String(objects.length + 1).padStart(6, '0')}`;
    objects.push({
      blob,
      ref: {
        filename,
        mimeType,
        objectId,
        path: paths.reserve(
          directory ? [...directory, filename] : createInternalObjectSegments(objectId, filename)
        ),
        size: blob.size,
      },
    });
    return objectId;
  };
  return { addObject, objects };
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
    )[mimeType.toLocaleLowerCase('en-US')] ?? '';
  return `Asset ${String(index + 1).padStart(3, '0')}${extension}`;
}
