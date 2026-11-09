import { initDB } from '../infrastructure/indexed-db/core';
import type { IDBPTransaction } from 'idb';
import type { PhysicalDeleteAssetOperation } from '../assets';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { retainVideoProjectRevisionInTransaction } from './revisions';
import { captureDeletionInTransaction } from '../sync-capture/capture';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  collectProjectOwnedAssetIds,
  deleteProjectAssetsUnreferencedByOtherProjects,
} from './asset-references';
import { createProjectDeletionStores } from './mutation-stores';
import { parseVideoProjectEntry } from './read-guards';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import {
  projectAssetPublicationAdapter,
  projectExportPublicationAdapter,
} from './asset-publication';
import { recoverSelectedAssetPublications } from '../assets/recovery';
import { readAssetReadyPublicationClaims } from '../assets/opfs-store';
import {
  runWithDurableAssetLifecycleLock,
  runWithPersistenceMutationTransition,
} from '../infrastructure/mutation-barrier';
import {
  MediaAssetDeletionBlockedError,
  StaleMediaAssetDeletePreviewError,
} from '../media-library/deletion-errors';

/** Delete an admitted project in the caller transaction without capture or transaction completion. */
export async function deleteVideoProjectInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  id: string,
  operation: PhysicalDeleteAssetOperation
): Promise<string[]> {
  const projects = tx.objectStore(VIDEO_PROJECTS_STORE);
  const existing = parseVideoProjectEntry(await projects.get(id));
  const projectAssetIds = collectProjectOwnedAssetIds(existing?.project);
  if (existing)
    await retainVideoProjectRevisionInTransaction(tx, id, existing.workspaceRevision ?? 0);
  await projects.delete(id);
  await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).delete(['video-project', id]);
  return deleteProjectAssetsUnreferencedByOtherProjects({ tx, operation, projectAssetIds });
}

export async function deleteVideoProject(id: string): Promise<string[]> {
  const db = await initDB();
  return runWithPersistenceMutationTransition((transitionPermit) =>
    runWithDurableAssetLifecycleLock(async (lifecyclePermit) => {
      const readSelection = async () => {
        const raw: unknown = await db.get(VIDEO_PROJECTS_STORE, id);
        const entry = parseVideoProjectEntry(raw);
        if (raw !== undefined && (!entry || entry.id !== id))
          throw new MediaAssetDeletionBlockedError('source-unavailable');
        return [...new Set(collectProjectOwnedAssetIds(entry?.project))].sort();
      };
      let projectAssetIds = await readSelection();
      const recoverSelection = async () =>
        recoverSelectedAssetPublications(
          [projectAssetPublicationAdapter, projectExportPublicationAdapter],
          { id, projectAssetIds },
          { transitionPermit, lifecyclePermit }
        );
      await recoverSelection();
      const refreshedIds = await readSelection();
      if (JSON.stringify(refreshedIds) !== JSON.stringify(projectAssetIds)) {
        projectAssetIds = refreshedIds;
        await recoverSelection();
      }
      const claims = await readAssetReadyPublicationClaims(
        { id, projectAssetIds },
        lifecyclePermit
      );
      if (!claims.valid || claims.pending)
        throw new MediaAssetDeletionBlockedError('pending-publication');
      const physicalDelete = buildPhysicalDeleteOperation([]);
      const deletedProjectAssetIds = await runWithIndexedDbMutation(async (db) => {
        const { assetOperationStore, projectStore, tx } = createProjectDeletionStores(db);
        try {
          const raw: unknown = await projectStore.get(id);
          const existing = parseVideoProjectEntry(raw);
          if (raw !== undefined && (!existing || existing.id !== id))
            throw new MediaAssetDeletionBlockedError('source-unavailable');
          const currentIds = [...new Set(collectProjectOwnedAssetIds(existing?.project))].sort();
          if (JSON.stringify(currentIds) !== JSON.stringify(projectAssetIds))
            throw new StaleMediaAssetDeletePreviewError();
          const deletedProjectAssetIds = await deleteVideoProjectInTransaction(
            tx,
            id,
            physicalDelete
          );
          if (physicalDelete.assetIds.length > 0) await assetOperationStore.put(physicalDelete);
          if (existing) await captureDeletionInTransaction(tx, 'video-project', id);
          await tx.done;
          return deletedProjectAssetIds;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* Transaction may already be closed. */
          }
          await tx.done.catch(() => undefined);
          throw error;
        }
      });
      if (physicalDelete.assetIds.length > 0)
        await completePhysicalDeleteOperation(physicalDelete, lifecyclePermit);
      return deletedProjectAssetIds;
    })
  );
}
