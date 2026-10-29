import { sanitizeArchivePathSegment } from '../../composition/archive-transfer';
import { assertPortableJson, parseRootEnvelope } from '../media-hub-backup/v6/codec';
import type { MediaHubBackupRootInventoryItem } from '../media-hub-backup/v6/contracts';

/** Load frozen inventory with portable metadata and safe object filenames. */
export async function loadCapturedInventory(root: MediaHubBackupRootInventoryItem) {
  const loaded = await root.load();
  // Backup roles can contain path punctuation. Preserve metadata while sanitizing filenames.
  const objects = loaded.objects.map((object) => ({
    ...object,
    ref: { ...object.ref, filename: sanitizeArchivePathSegment(object.ref.filename) },
  }));
  const metadata: unknown = JSON.parse(JSON.stringify(loaded.metadata));
  assertPortableJson(metadata);
  return { loaded, metadata, objects };
}

/** Assemble the canonical envelope after each root-specific metadata check. */
export function createCapturedRootEnvelope(
  root: MediaHubBackupRootInventoryItem,
  inventory: Pick<Awaited<ReturnType<typeof loadCapturedInventory>>, 'metadata' | 'objects'>
) {
  return parseRootEnvelope({
    descriptor: { ...root.descriptor, metadataPath: 'Metadata/sync-root.json' },
    metadata: inventory.metadata,
    objects: inventory.objects.map((object) => object.ref),
  });
}
