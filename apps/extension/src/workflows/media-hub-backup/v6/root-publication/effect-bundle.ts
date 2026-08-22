import {
  appendCommittedArchiveRootInTransaction,
  readAssetFile,
} from '../../../../composition/persistence/assets';
import { putEffectBundleBackupRestore } from '../../../../composition/persistence/effect-bundles/backup-restore';
import {
  ASSET_OPERATIONS_STORE,
  VIDEO_EFFECT_BUNDLES_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import { parseEffectBundleMetadata } from '../root-codecs/effect-bundle';
import type { ArchiveRootPublisher } from '../restore';

export const effectBundleRootPublisher: ArchiveRootPublisher = {
  profile: 'media:effect-bundle',
  async checkpointSkipIfExisting({ envelope, session }) {
    const metadata = parseEffectBundleMetadata(envelope.metadata);
    return runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction([VIDEO_EFFECT_BUNDLES_STORE, ASSET_OPERATIONS_STORE], 'readwrite');
      if (!(await tx.objectStore(VIDEO_EFFECT_BUNDLES_STORE).get(metadata.entry.packId))) {
        await tx.done;
        return false;
      }
      await appendCommittedArchiveRootInTransaction(
        tx.objectStore(ASSET_OPERATIONS_STORE),
        session.operationId,
        `media:effect-bundle:${envelope.descriptor.rootId}`,
        metadata.entry.packId,
        false,
        true
      );
      await tx.done;
      return true;
    });
  },
  async publish({ envelope, session, staged }) {
    const metadata = parseEffectBundleMetadata(envelope.metadata);
    const stagedByObjectId = new Map(staged.map((object) => [object.objectId, object]));
    const assets = await Promise.all(
      metadata.entry.assets.map(async (asset) => {
        const object = stagedByObjectId.get(asset.objectId);
        if (!object) throw new Error(`Effect bundle archive object is missing: ${asset.objectId}.`);
        return {
          blob: await readAssetFile(object.ref, asset.objectId),
          byteLength: asset.byteLength,
          kind: asset.kind,
          mimeType: asset.mimeType,
          sha256: asset.sha256,
        };
      })
    );
    const { assets: _assets, ...entry } = metadata.entry;
    const rootKey = `media:effect-bundle:${envelope.descriptor.rootId}`;
    let targetPackId = metadata.entry.packId;
    let conflicted = false;
    let imported = false;
    await runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction([VIDEO_EFFECT_BUNDLES_STORE, ASSET_OPERATIONS_STORE], 'readwrite');
      const restored = await putEffectBundleBackupRestore({
        assets,
        entry,
        store: tx.objectStore(VIDEO_EFFECT_BUNDLES_STORE),
        strategy: session.strategy,
      });
      targetPackId = restored.packId;
      conflicted = restored.conflicted;
      imported = restored.imported;
      await appendCommittedArchiveRootInTransaction(
        tx.objectStore(ASSET_OPERATIONS_STORE),
        session.operationId,
        rootKey,
        targetPackId,
        imported,
        restored.conflicted
      );
      await tx.done;
    });
    return { conflicted, imported, retainedAssetIds: [] };
  },
};
