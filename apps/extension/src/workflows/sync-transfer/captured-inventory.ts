import { parseAssetRef, type AssetRef } from '../../composition/persistence/assets';
import {
  parseAssetResidencyRecord,
  type AssetResidencyCopy,
} from '../../composition/persistence/assets/residency-records';
import type { ArchiveObjectRef } from '../../composition/archive-transfer';
import type { DeferredInventoryAssets } from '../media-hub-backup/v6/inventory/helpers';
import { isSyncObjectRemoteKey } from './wire-record';
import { createInternalObjectSegments } from '../media-hub-backup/v6/layout';
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
  inventory: Pick<Awaited<ReturnType<typeof loadCapturedInventory>>, 'metadata' | 'objects'>,
  retained: readonly ArchiveObjectRef[] = []
) {
  return parseRootEnvelope({
    descriptor: { ...root.descriptor, metadataPath: 'Metadata/sync-root.json' },
    metadata: inventory.metadata,
    objects: [...inventory.objects.map((object) => object.ref), ...retained].sort((a, b) =>
      a.objectId.localeCompare(b.objectId)
    ),
  });
}

/** Detach verified copies for canonical frozen inventory slots; this grants no local residency. */
export function createCapturedAssetInventory(
  nativeRefs: readonly AssetRef[],
  values: ReadonlyMap<string, AssetResidencyCopy>
) {
  const refs = new Map(
    nativeRefs.map((raw) => {
      const ref = parseAssetRef(raw);
      if (!ref) throw new Error('Deferred native asset reference is invalid.');
      return [ref.assetId, ref] as const;
    })
  );
  const copies = new Map<string, AssetResidencyCopy>();
  const filenames = new Map<string, string>();
  const selected = new Map<string, AssetRef>();
  const retained = new Map<string, { ref: ArchiveObjectRef; copy: AssetResidencyCopy }>();
  const used = new Set<string>();
  for (const [assetId, raw] of values) {
    const copy = parseAssetResidencyRecord(raw);
    const ref = refs.get(assetId);
    const filename = copy?.kind === 'copy' ? copy.remote.key.split('/').at(-1) : undefined;
    if (
      !ref ||
      !copy ||
      copy.kind !== 'copy' ||
      copy.target.kind !== 'opfs' ||
      (copy.phase !== 'unloaded' && copy.phase !== 'unloading') ||
      JSON.stringify(copy.target.ref) !== JSON.stringify(ref) ||
      !filename ||
      !isSyncObjectRemoteKey(copy.remote.binding.spaceId, filename, copy.remote.key)
    )
      throw new Error('Deferred asset differs from its frozen native reference.');
    copies.set(assetId, copy);
    filenames.set(assetId, filename);
    selected.set(assetId, ref);
  }
  const port: DeferredInventoryAssets = {
    refs: selected,
    onObject(assetId, descriptor) {
      const copy = copies.get(assetId);
      const ref = selected.get(assetId);
      const filename = filenames.get(assetId);
      if (
        !copy ||
        !ref ||
        !filename ||
        descriptor.size !== ref.size ||
        descriptor.mimeType !== ref.mimeType.split(';', 1)[0]!.trim().toLowerCase()
      )
        throw new Error('Deferred descriptor differs from its frozen native reference.');
      if (retained.has(descriptor.objectId))
        throw new Error('Deferred descriptor identity is repeated.');
      used.add(assetId);
      retained.set(descriptor.objectId, {
        ref: {
          ...descriptor,
          filename,
          path: createInternalObjectSegments(descriptor.objectId, filename)
            .map((value) => sanitizeArchivePathSegment(value))
            .join('/'),
        },
        copy,
      });
    },
  };
  return {
    port,
    copies,
    objects: retained,
    assertUsed() {
      if ([...copies.keys()].some((id) => !used.has(id)))
        throw new Error('Deferred asset has no canonical frozen inventory slot.');
    },
    descriptors() {
      return [...retained.values()].map((object) => object.ref);
    },
    retainedObjects() {
      return [...retained.values()].map(({ ref, copy }) => ({
        objectId: ref.objectId,
        remoteKey: copy.remote.key,
        sha256: copy.remote.sha256,
      }));
    },
  };
}
