import { createArchiveObjectPath } from '../../../../composition/archive-transfer';
import { parseAssetRef, readAssetFile } from '../../../../composition/persistence/assets';
import type { ArchiveRootObjectSource } from '../export';

export interface InventoryDatabase {
  get(store: string, key: unknown): Promise<unknown>;
  getAll(store: string): Promise<unknown[]>;
  getAllFromIndex(store: string, index: string, key: unknown): Promise<unknown[]>;
}

export function createObjectCollector(rootLabel: string) {
  const objects: ArchiveRootObjectSource[] = [];
  const addObject = (
    blob: Blob,
    filename: string,
    mimeType = blob.type || 'application/octet-stream'
  ) => {
    const objectId = `${rootLabel}-object-${String(objects.length + 1).padStart(6, '0')}`;
    objects.push({
      blob,
      ref: {
        filename,
        mimeType,
        objectId,
        path: createArchiveObjectPath(objectId, filename),
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
