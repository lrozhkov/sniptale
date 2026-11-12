import {
  appendCommittedArchiveRootInTransaction,
  readAssetFile,
} from '../../../../composition/persistence/assets';
import { prepareEffectBundleBackupRestore } from '../../../../composition/persistence/effect-bundles/backup-restore';
import {
  initDB,
  ASSET_OPERATIONS_STORE,
  VIDEO_ANIMATION_PACKAGES_STORE,
  VIDEO_GL_TRANSITION_PRESETS_STORE,
  VIDEO_VISUAL_PREFERENCES_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { runVisualCatalogMutation } from '../../../../composition/persistence/effect-bundles/preferences';
import {
  parseEffectBundleMetadata,
  visualCatalogMetadataRootId,
} from '../root-codecs/effect-bundle';
import type { ArchiveRootPublisher } from '../restore';
export const effectBundleRootPublisher: ArchiveRootPublisher = {
  profile: 'media:effect-bundle',
  async checkpointSkipIfExisting({ envelope, session }) {
    const metadata = parseEffectBundleMetadata(envelope.metadata),
      storeName =
        metadata.kind === 'animation'
          ? VIDEO_ANIMATION_PACKAGES_STORE
          : VIDEO_GL_TRANSITION_PRESETS_STORE,
      id = metadata.kind === 'animation' ? metadata.entry.packId : metadata.entry.id;
    return runVisualCatalogMutation(async (permit) => {
      const db = await initDB(permit);
      const tx = db.transaction([storeName, ASSET_OPERATIONS_STORE], 'readwrite');
      try {
        if ((await tx.objectStore(storeName).get(id)) === undefined) {
          await tx.done;
          return false;
        }
        await appendCommittedArchiveRootInTransaction(
          tx.objectStore(ASSET_OPERATIONS_STORE),
          session.operationId,
          {
            rootKey: `media:effect-bundle:${envelope.descriptor.rootId}`,
            targetRootId: visualCatalogMetadataRootId(metadata),
            imported: false,
            conflicted: true,
          }
        );
        await tx.done;
        return true;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* Already aborted. */
        }
        await tx.done.catch(() => undefined);
        throw error;
      }
    });
  },
  async publish({ envelope, session, staged }) {
    return runVisualCatalogMutation(async (permit) => {
      const metadata = parseEffectBundleMetadata(envelope.metadata),
        byId = new Map(staged.map((object) => [object.objectId, object]));
      const text = async (objectId: string, bytes: number) => {
        const object = byId.get(objectId);
        if (!object) throw Error(`Visual catalogue object is missing: ${objectId}.`);
        const blob = await readAssetFile(object.ref, objectId);
        if (blob.size !== bytes) throw Error('Visual catalogue source size does not match.');
        return new TextDecoder('utf-8', { fatal: true }).decode(await blob.arrayBuffer());
      };
      let entry: unknown;
      if (metadata.kind === 'animation')
        entry = {
          ...metadata.entry,
          documents: await Promise.all(
            metadata.entry.documents.map(async (doc) => ({
              id: doc.id,
              sha256: doc.sha256,
              source: await text(doc.objectId, doc.byteLength),
            }))
          ),
        };
      else {
        const { sourceObjectId, ...header } = metadata.entry;
        entry = {
          ...header,
          source: await text(sourceObjectId, metadata.entry.retainedByteLength),
        };
      }
      const publish = await prepareEffectBundleBackupRestore({
        kind: metadata.kind,
        entry,
        ...(metadata.preference ? { preference: metadata.preference } : {}),
      });
      const estimate =
        typeof navigator === 'undefined'
          ? undefined
          : await navigator.storage?.estimate?.().catch(() => undefined);
      const result = await (async () => {
        const db = await initDB(permit);
        const storeName =
            metadata.kind === 'animation'
              ? VIDEO_ANIMATION_PACKAGES_STORE
              : VIDEO_GL_TRANSITION_PRESETS_STORE,
          tx = db.transaction(
            [storeName, VIDEO_VISUAL_PREFERENCES_STORE, ASSET_OPERATIONS_STORE],
            'readwrite'
          );
        try {
          const restored = await publish({
            store: tx.objectStore(storeName),
            preferences: tx.objectStore(VIDEO_VISUAL_PREFERENCES_STORE),
            strategy: session.strategy,
            ...(estimate ? { estimate } : {}),
          });
          await appendCommittedArchiveRootInTransaction(
            tx.objectStore(ASSET_OPERATIONS_STORE),
            session.operationId,
            {
              rootKey: `media:effect-bundle:${envelope.descriptor.rootId}`,
              targetRootId: restored.rootId,
              imported: restored.imported,
              conflicted: restored.conflicted,
            }
          );
          await tx.done;
          return restored;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* Already aborted. */
          }
          await tx.done.catch(() => undefined);
          throw error;
        }
      })();
      return { conflicted: result.conflicted, imported: result.imported, retainedAssetIds: [] };
    });
  },
};
