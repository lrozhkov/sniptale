import { initDB, type IndexedDbWriteTransaction } from '../infrastructure/indexed-db/core';
import {
  MEDIA_LIBRARY_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  PROJECT_ASSETS_STORE,
  ASSET_OPERATIONS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { enqueuePrivateSourceRetirement } from '../assets/private-source-retention';
import { tryAssetResourceCleanup } from '../assets/resource-sessions';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { withReviewWorkspaceUsage } from '../media-library/usage-index-keys';
import { collectReviewAssetReferences } from './asset-refs';
import { parseVideoWorkspace } from './parser';
import { materializeVideoWorkspaceProject, parseWorkspaceProject } from './project-metadata';
import { createVideoWorkspaceStore, readWorkspaceStorage, writeWorkspaceStorage } from './storage';
import type { WorkspaceStorageReadTransaction } from './storage';
import type { VideoWorkspaceProject } from './contracts';
import { VideoWorkspaceError } from './store';

const PROJECT_STORES = [MEDIA_LIBRARY_STORE, VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE];

/** Admit existing project content in the caller's transaction; never create a missing project. */
export async function readStoredVideoWorkspaceProject(
  tx: WorkspaceStorageReadTransaction,
  id: string
) {
  const storage = await readWorkspaceStorage(tx, id);
  const workspace = parseVideoWorkspace(storage.logical);
  if (!workspace || workspace.aggregateId !== id) throw new VideoWorkspaceError('invalid');
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(id));
  return { storage, workspace: materializeVideoWorkspaceProject(workspace, media?.filename ?? id) };
}

/** Metadata shares workspace CAS and preserves physical history and recovery in the caller's transaction. */
export async function writeVideoWorkspaceProject(
  tx: IndexedDbWriteTransaction,
  id: string,
  expectedRevision: number,
  project: VideoWorkspaceProject,
  now: number
): Promise<void> {
  const { storage, workspace } = await readStoredVideoWorkspaceProject(tx, id);
  if (workspace.revision !== expectedRevision) throw new VideoWorkspaceError('conflict');
  const admitted = parseWorkspaceProject(project);
  if (
    !admitted ||
    !Number.isFinite(now) ||
    now < 0 ||
    !Number.isSafeInteger(workspace.revision + 1)
  )
    throw new VideoWorkspaceError('invalid');
  const next = {
    ...workspace,
    project: admitted,
    revision: workspace.revision + 1,
    updatedAt: Math.max(now, workspace.updatedAt),
  };
  await writeWorkspaceStorage(tx, {
    storage,
    previous: workspace,
    workspace: next,
    mode: 'cursor',
    usageReferenceKeys: withReviewWorkspaceUsage(next).usageReferenceKeys,
  });
}

/** Rename only the confirmed project; source metadata and authored history remain independent. */
export async function renameVideoWorkspaceProject(
  id: string,
  expectedRevision: number,
  name: string
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(PROJECT_STORES, 'readwrite', { durability: 'strict' });
    try {
      const { workspace } = await readStoredVideoWorkspaceProject(tx, id);
      if (workspace.project.lifecycle.trashedAt !== undefined)
        throw new VideoWorkspaceError('conflict');
      const now = Math.max(Date.now(), workspace.project.lifecycle.updatedAt + 1);
      await writeVideoWorkspaceProject(
        tx,
        id,
        expectedRevision,
        {
          ...workspace.project,
          name: name.trim(),
          lifecycle: { ...workspace.project.lifecycle, updatedAt: now },
        },
        now
      );
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already be inactive. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

/** Purge only a confirmed project and journal its private resources; retain the Library source. */
export async function deleteVideoWorkspaceProject(
  id: string,
  expectedRevision: number
): Promise<void> {
  await initDB();
  await runWithDurableAssetLifecycleLock(async (permit) => {
    const operation = buildPhysicalDeleteOperation([]);
    // Live editors hold the reader through disposal; reject before removing their CAS evidence.
    const purged = await tryAssetResourceCleanup(async () => {
      await runWithIndexedDbMutation(async (db) => {
        const tx = db.transaction(
          [
            ...PROJECT_STORES,
            VIDEO_WORKSPACE_DRAFTS_STORE,
            PROJECT_ASSETS_STORE,
            ASSET_OPERATIONS_STORE,
          ],
          'readwrite',
          { durability: 'strict' }
        );
        try {
          const { workspace } = await readStoredVideoWorkspaceProject(tx, id);
          if (workspace.revision !== expectedRevision) throw new VideoWorkspaceError('conflict');
          await enqueuePrivateSourceRetirement(
            tx,
            [...collectReviewAssetReferences(workspace)]
              .filter((reference) => reference.startsWith('project-asset:'))
              .map((reference) => reference.slice('project-asset:'.length)),
            operation
          );
          await createVideoWorkspaceStore(tx).delete(id);
          await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).delete(id);
          if (operation.privateSources?.length)
            await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
          await tx.done;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* The transaction may already be inactive. */
          }
          await tx.done.catch(() => undefined);
          throw error;
        }
      });
      return true;
    });
    if (!purged) throw new VideoWorkspaceError('conflict');
    // The committed journal retains retry authority if physical cleanup is unavailable.
    if (operation.privateSources?.length)
      await completePhysicalDeleteOperation(operation, permit).catch(() => undefined);
  });
}
