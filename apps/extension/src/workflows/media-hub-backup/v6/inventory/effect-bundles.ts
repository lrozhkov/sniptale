import { assertMetadataJson } from '../codec';
import type { ArchivePathAllocator } from '../../../../composition/archive-transfer';
import {
  type initDB,
  VIDEO_EFFECT_BUNDLES_STORE,
  VIDEO_ANIMATION_PACKAGES_STORE,
  VIDEO_GL_TRANSITION_PRESETS_STORE,
  VIDEO_VISUAL_PREFERENCES_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { parseStoredAnimationCatalogEntry } from '../../../../composition/persistence/effect-bundles/entry';
import { assertAnimationCatalogIntegrity } from '../../../../composition/persistence/effect-bundles/integrity';
import { parseGlPresetCatalogEntry } from '../../../../composition/persistence/effect-bundles/gl-presets';
import { admitVisualCatalogPreferences } from '../../../../composition/persistence/effect-bundles/preferences';
import {
  encodeEffectBundleMetadata,
  visualCatalogMetadataRootId,
} from '../root-codecs/effect-bundle';
import type { MediaHubBackupRootInventoryItem } from '../export';
import { createInternalObjectSegments, METADATA_ROOT } from '../layout';

/** Read one native snapshot; no browser mirror, source rewrite or implicit legacy conversion. */
export async function buildEffectBundleRootInventory(
  db: Pick<Awaited<ReturnType<typeof initDB>>, 'transaction'>,
  paths: ArchivePathAllocator
): Promise<MediaHubBackupRootInventoryItem[]> {
  const tx = db.transaction(
    [
      VIDEO_EFFECT_BUNDLES_STORE,
      VIDEO_ANIMATION_PACKAGES_STORE,
      VIDEO_GL_TRANSITION_PRESETS_STORE,
      VIDEO_VISUAL_PREFERENCES_STORE,
    ],
    'readonly'
  );
  const [legacy, animations, transitions, rawPreferences] = await Promise.all([
    tx.objectStore(VIDEO_EFFECT_BUNDLES_STORE).getAll(),
    tx.objectStore(VIDEO_ANIMATION_PACKAGES_STORE).getAll(),
    tx.objectStore(VIDEO_GL_TRANSITION_PRESETS_STORE).getAll(),
    tx.objectStore(VIDEO_VISUAL_PREFERENCES_STORE).getAll(),
  ]);
  await tx.done;
  if (legacy.length) {
    const names = legacy.map((row: unknown, index: number) =>
      typeof row === 'object' && row !== null && 'packId' in row && typeof row.packId === 'string'
        ? row.packId.slice(0, 192)
        : `unknown-${index + 1}`
    );
    throw Error(`Unsupported legacy effect catalog entries: ${names.join(', ')}`);
  }
  const preferences = admitVisualCatalogPreferences(rawPreferences);
  const entries = [
    ...animations.map((value: unknown) => {
      const entry = parseStoredAnimationCatalogEntry(value);
      if (!entry) throw Error('Invalid animation backup source.');
      return entry;
    }),
    ...transitions.map((value: unknown) => {
      const entry = parseGlPresetCatalogEntry(value);
      if (!entry) throw Error('Invalid GL backup source.');
      return entry;
    }),
  ];
  entries.sort((a, b) =>
    (a.format === 'sniptale-animation-catalog'
      ? `animation:${a.packId}`
      : `transition:${a.id}`
    ).localeCompare(
      b.format === 'sniptale-animation-catalog' ? `animation:${b.packId}` : `transition:${b.id}`
    )
  );
  return Promise.all(
    entries.map(async (entry, index) => {
      if (entry.format === 'sniptale-animation-catalog')
        await assertAnimationCatalogIntegrity(entry);
      const kind = entry.format === 'sniptale-animation-catalog' ? 'animation' : 'transition',
        id = entry.format === 'sniptale-animation-catalog' ? entry.packId : entry.id;
      const sources =
        entry.format === 'sniptale-animation-catalog'
          ? entry.documents.map((doc) => doc.source)
          : [entry.source];
      const objects = sources.map((source, sourceIndex) => {
        const rootOrder = String(index + 1).padStart(6, '0');
        const sourceOrder = String(sourceIndex + 1).padStart(6, '0');
        const objectId = `effect-bundle-${rootOrder}-object-${sourceOrder}`,
          filename = `source-${sourceOrder}.json`,
          blob = new Blob([source], { type: 'application/json' });
        return {
          blob,
          ref: {
            objectId,
            filename,
            mimeType: 'application/json',
            path: paths.reserve(createInternalObjectSegments(objectId, filename)),
            size: blob.size,
          },
        };
      });
      const preference = preferences.find((row) => row.kind === kind && row.packId === id);
      const metadata = encodeEffectBundleMetadata({
          entry,
          objectIds: objects.map((object) => object.ref.objectId),
          ...(preference ? { preference } : {}),
        }),
        rootId = visualCatalogMetadataRootId(metadata);
      assertMetadataJson(metadata);
      return {
        descriptor: {
          mediaSubtype: 'effect-bundle' as const,
          metadataPath: `${METADATA_ROOT}/media/effect-bundle-${encodeURIComponent(rootId)}.json`,
          objectCount: objects.length,
          rootId,
          rootKind: 'media' as const,
          totalBytes: objects.reduce((sum, object) => sum + object.ref.size, 0),
        },
        load: async () => ({ metadata, objects }),
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
