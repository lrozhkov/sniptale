import type { ArchivePathAllocator } from '../../../../composition/archive-transfer';
import { VIDEO_EFFECT_BUNDLES_STORE } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { parseEffectBundleCatalogEntry } from '../../../../composition/persistence/effect-bundles/entry';
import { assertEffectBundleCatalogIntegrity } from '../../../../composition/persistence/effect-bundles/integrity';
import { encodeEffectBundleMetadata } from '../root-codecs/effect-bundle';
import type { MediaHubBackupRootInventoryItem } from '../export';
import type { JsonValue } from '../contracts';
import { createInternalObjectSegments, METADATA_ROOT } from '../layout';

interface EffectBundleInventoryDatabase {
  getAll(store: typeof VIDEO_EFFECT_BUNDLES_STORE): Promise<unknown>;
}

function portableObjectId(rootIndex: number, assetIndex: number): string {
  return `effect-bundle-${String(rootIndex + 1).padStart(6, '0')}-object-${String(assetIndex + 1).padStart(6, '0')}`;
}

export async function buildEffectBundleRootInventory(
  db: EffectBundleInventoryDatabase,
  paths: ArchivePathAllocator
): Promise<MediaHubBackupRootInventoryItem[]> {
  const values = await db.getAll(VIDEO_EFFECT_BUNDLES_STORE);
  if (!Array.isArray(values)) throw new Error('Effect bundle backup inventory is invalid.');
  const entries = values.map(parseEffectBundleCatalogEntry);
  if (entries.some((entry) => entry === null)) {
    throw new Error('Effect bundle backup inventory contains invalid metadata.');
  }
  return Promise.all(
    entries
      .map((entry) => entry!)
      .sort((left, right) => left.packId.localeCompare(right.packId))
      .map(async (entry, rootIndex) => {
        await assertEffectBundleCatalogIntegrity(entry);
        const objectIds = entry.assets.map((_, assetIndex) =>
          portableObjectId(rootIndex, assetIndex)
        );
        const objects = entry.assets.map((asset, assetIndex) => {
          const objectId = objectIds[assetIndex]!;
          const filename = `asset-${String(assetIndex + 1).padStart(6, '0')}`;
          return {
            blob: asset.blob,
            ref: {
              filename,
              mimeType: asset.mimeType,
              objectId,
              path: paths.reserve(createInternalObjectSegments(objectId, filename)),
              size: asset.byteLength,
            },
          };
        });
        const descriptor = {
          mediaSubtype: 'effect-bundle' as const,
          metadataPath: `${METADATA_ROOT}/media/effect-bundle-${encodeURIComponent(entry.packId)}.json`,
          objectCount: objects.length,
          rootId: entry.packId,
          rootKind: 'media' as const,
          totalBytes: objects.reduce((total, object) => total + object.ref.size, 0),
        };
        return {
          descriptor,
          load: async () => ({
            metadata: encodeEffectBundleMetadata({ entry, objectIds }) as unknown as JsonValue,
            objects,
          }),
          summary: {
            draftCount: 0,
            recordingCount: 0,
            sourceMetadataCount: 0,
            telemetryCount: 0,
            thumbnailCount: 0,
            webSnapshotCount: 0,
          },
        };
      })
  );
}
