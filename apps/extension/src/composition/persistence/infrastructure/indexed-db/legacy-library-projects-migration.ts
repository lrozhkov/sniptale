import type { PhysicalDeleteAssetOperation } from '../../assets/contracts';
import { collectTargetAssetSnapshotInTransaction } from '../../assets/retention-index';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { projectRowReferenceKeys } from '../../assets/retention-index-projection';
import { parseAggregatePresentationEntry } from '../../aggregate-presentations/parser';
import { imageWorkspaceAssetBindings } from '../../image-workspaces/assets';
import { parseImageWorkspaceIdentity } from '../../image-workspaces/identity';
import { parseImageWorkspaceEntry } from '../../image-workspaces/parser';
import { createLibraryLifecycle } from '../../library-lifecycle/contracts';
import {
  hasLegacyLibraryCapture,
  isUneditedLegacyImage,
  isUneditedLegacyQuickEdit,
  legacyImageProjectId,
  legacyQuickEditProjectId,
} from '../../media-library/legacy-projects';
import { parseMediaLibraryEntry } from '../../media-library/read-guards';
import { withReviewWorkspaceUsage } from '../../media-library/usage-index-keys';
import { projectWorkspaceReferenceKeys } from '../../review-workspaces/index-projection';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from '../../review-workspaces/parser';
import { materializeVideoWorkspaceProject } from '../../review-workspaces/project-metadata';
import {
  materializeWorkspaceStorage,
  workspaceStorageHead,
  workspaceStorageRows,
} from '../../review-workspaces/storage-format';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  ASSET_OPERATIONS_STORE,
  IMAGE_WORKSPACES_STORE,
  IMAGE_WORKSPACE_IDENTITIES_STORE,
  MEDIA_LIBRARY_STORE,
  SYNC_CAPTURE_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
} from './core.stores';
import {
  UNKNOWN_HISTORY_REFERENCES,
  stripRowReferenceMetadata,
  withRowReferenceMetadata,
} from './row-index-contract';
import { readPendingDeletionReferenceBackfill } from './deletion-index-migration';
import type { DatabaseMigrationSource, UpgradeTransaction } from './upgrade/types';

export const LEGACY_LIBRARY_PROJECT_MIGRATION_STORES = [
  IMAGE_WORKSPACES_STORE,
  IMAGE_WORKSPACE_IDENTITIES_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  MEDIA_LIBRARY_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  ASSET_OPERATIONS_STORE,
] as const;

type Store = ReturnType<UpgradeTransaction['objectStore']>;

async function read(store: Store, key: IDBValidKey): Promise<unknown> {
  if (!store.get) throw new Error('Legacy Library metadata lookup is unavailable.');
  return store.get(key);
}

async function visit(store: Store, migrate: (row: unknown) => Promise<void>): Promise<void> {
  if (!store.openCursor) throw new Error('Legacy Library migration requires a native cursor.');
  let cursor = await store.openCursor();
  while (cursor) {
    await migrate(stripRowReferenceMetadata(cursor.value));
    cursor = await cursor.continue();
  }
}

async function releaseDiscardedImageWorkspace(
  tx: UpgradeTransaction,
  id: string,
  bindings: ReturnType<typeof imageWorkspaceAssetBindings>
): Promise<void> {
  const owners = tx.objectStore(ASSET_OWNERS_STORE);
  for (const { role } of bindings) await owners.delete(['image-workspace', id, role]);
  const ids = [...new Set(bindings.map(({ assetId }) => assetId))];
  const snapshot = await collectTargetAssetSnapshotInTransaction(
    {
      objectStore(name) {
        const store = tx.objectStore(name);
        return {
          get: (key) => read(store, key),
          index(indexName) {
            const index = store.index?.(indexName);
            if (!index?.getKey) throw new Error('Legacy asset custody index is unavailable.');
            return { getAll: index.getAll.bind(index), getKey: index.getKey.bind(index) };
          },
        };
      },
    },
    ids
  );
  if (!snapshot.authorityValid) return;
  const retained = new Set([
    ...snapshot.owners.map(({ assetId }) => assetId),
    ...snapshot.expectedOwners.map(({ assetId }) => assetId),
    ...snapshot.protectedRollbackAssetIds,
    ...snapshot.protectedSyncCaptureAssetIds,
  ]);
  const assetIds = ids.filter((assetId) => !retained.has(assetId));
  if (!assetIds.length) return;
  for (const assetId of assetIds) await tx.objectStore(ASSET_REFS_STORE).delete(assetId);
  const now = Date.now();
  const operation: PhysicalDeleteAssetOperation = {
    operationId: crypto.randomUUID(),
    status: 'pending',
    kind: 'physical-delete',
    createdAt: now,
    updatedAt: now,
    assetIds,
  };
  await tx
    .objectStore(ASSET_OPERATIONS_STORE)
    .put(
      withRowReferenceMetadata(
        operation,
        projectRowReferenceKeys(ASSET_OPERATIONS_STORE, operation)
      )
    );
}

async function migrateImage(tx: UpgradeTransaction, raw: unknown): Promise<void> {
  const workspace = parseImageWorkspaceEntry(raw);
  if (
    !workspace ||
    workspace.sourceMediaId !== undefined ||
    !Number.isSafeInteger(workspace.revision)
  )
    return;
  const id = workspace.aggregateId;
  const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
  const source = parseMediaLibraryEntry(await read(mediaStore, id));
  if (!source || source.id !== id || (source.kind !== 'image' && source.kind !== 'screenshot'))
    return;
  if (
    source.workspaceRevision !== workspace.revision ||
    (await hasLegacyLibraryCapture(
      (key) => read(tx.objectStore(SYNC_CAPTURE_STORE), key),
      'media',
      id
    ))
  )
    return;
  const projectId = legacyImageProjectId(id);
  const project = parseImageWorkspaceEntry({
    ...workspace,
    aggregateId: projectId,
    sourceMediaId: id,
    lifecycle: source.lifecycle ?? createLibraryLifecycle('library', workspace.updatedAt),
  });
  if (!project) return;
  const identities = tx.objectStore(IMAGE_WORKSPACE_IDENTITIES_STORE);
  const rawIdentity = await read(identities, id);
  const identity = parseImageWorkspaceIdentity(rawIdentity, id);
  if (rawIdentity !== undefined && (!identity || identity.retired || identity.legacyMove)) return;
  const workspaces = tx.objectStore(IMAGE_WORKSPACES_STORE);
  const presentations = tx.objectStore(AGGREGATE_PRESENTATIONS_STORE);
  const presentation = await read(presentations, ['image', id]);
  const preview = parseAggregatePresentationEntry(presentation);
  if (
    (presentation !== undefined && (!preview || preview.aggregateId !== id)) ||
    (await read(workspaces, projectId)) !== undefined ||
    (await read(identities, projectId)) !== undefined ||
    (await read(mediaStore, projectId)) !== undefined ||
    (await read(presentations, ['image', projectId])) !== undefined
  )
    return;

  const owners = tx.objectStore(ASSET_OWNERS_STORE);
  const bindings = imageWorkspaceAssetBindings(workspace);
  for (const { assetId, role } of bindings) {
    const owner = await read(owners, ['image-workspace', id, role]);
    if (
      !isRecord(owner) ||
      owner['assetId'] !== assetId ||
      (await read(owners, ['image-workspace', projectId, role])) !== undefined
    )
      return;
  }
  const matchesOriginal =
    source.imageContentState === 'original' ||
    (source.source.kind === 'stored-asset' &&
      workspace.document.sourceImage.assetId === source.source.assetId);
  const keep =
    source.lifecycle?.trashedAt !== undefined ||
    !matchesOriginal ||
    !isUneditedLegacyImage(workspace, source.filename);
  const projectGeneration = keep ? crypto.randomUUID() : null;
  await identities.put({
    version: 1,
    aggregateId: id,
    generation: crypto.randomUUID(),
    retired: false,
    legacyMove: {
      revision: workspace.revision,
      previousGeneration: identity?.generation ?? null,
      projectGeneration,
      discardedPublicationId: keep ? null : (workspace.publicationId ?? null),
      trashedAt: source.lifecycle?.trashedAt ?? null,
    },
  });
  if (projectGeneration)
    await identities.put({
      version: 1,
      aggregateId: projectId,
      generation: projectGeneration,
      retired: false,
    });
  if (keep) {
    for (const { assetId, role } of bindings) {
      const owner = { assetId, ownerKind: 'image-workspace', ownerId: projectId, role };
      await owners.put(
        withRowReferenceMetadata(owner, projectRowReferenceKeys(ASSET_OWNERS_STORE, owner))
      );
      await owners.delete(['image-workspace', id, role]);
    }
  }
  const original = { ...source, workspaceRevision: 0, imageContentState: 'original' };
  await mediaStore.put(
    withRowReferenceMetadata(original, projectRowReferenceKeys(MEDIA_LIBRARY_STORE, original))
  );
  if (keep)
    await workspaces.put(
      withRowReferenceMetadata(project, projectRowReferenceKeys(IMAGE_WORKSPACES_STORE, project))
    );
  if (preview) {
    if (keep) await presentations.put({ ...preview, aggregateId: projectId });
    await presentations.delete(['image', id]);
  }
  await workspaces.delete(id);
  if (!keep) await releaseDiscardedImageWorkspace(tx, id, bindings);
}

async function migrateQuickEdit(tx: UpgradeTransaction, head: unknown): Promise<void> {
  if (
    !isRecord(head) ||
    typeof head['aggregateId'] !== 'string' ||
    head['sourceMediaId'] !== undefined
  )
    return;
  const id = head['aggregateId'];
  const media = tx.objectStore(MEDIA_LIBRARY_STORE);
  const source = parseMediaLibraryEntry(await read(media, id));
  if (
    !source ||
    source.id !== id ||
    !source.mimeType.startsWith('video/') ||
    (await hasLegacyLibraryCapture(
      (key) => read(tx.objectStore(SYNC_CAPTURE_STORE), key),
      'video-review',
      id
    ))
  )
    return;

  const history = tx.objectStore(VIDEO_WORKSPACE_HISTORY_STORE);
  if (!history.index) throw new Error('Legacy Quick Edit history lookup is unavailable.');
  const rows = (await history.index('aggregateId').getAll(id)).map(stripRowReferenceMetadata);
  const workspace = parseVideoWorkspace(materializeWorkspaceStorage(head, rows));
  if (!workspace || workspace.aggregateId !== id) return;
  const drafts = tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE);
  const rawDraft = await read(drafts, id);
  const draft =
    rawDraft === undefined ? null : parseVideoWorkspaceDraft(rawDraft, workspace.source.duration);
  if (rawDraft !== undefined && (!draft || draft.aggregateId !== id)) return;
  const workspaces = tx.objectStore(VIDEO_WORKSPACES_STORE);
  const projectId = legacyQuickEditProjectId(source);
  if (
    (await read(workspaces, projectId)) !== undefined ||
    (await read(drafts, projectId)) !== undefined ||
    (await read(media, projectId)) !== undefined ||
    (await history.index('aggregateId').getAll(projectId)).length
  )
    return;

  const oldKeys = [];
  for (const row of rows) {
    if (!isRecord(row) || row['aggregateId'] !== id || typeof row['ordinal'] !== 'number') return;
    oldKeys.push([id, row['ordinal']]);
  }
  if (draft || !isUneditedLegacyQuickEdit(workspace, source.filename)) {
    const project = materializeVideoWorkspaceProject(
      {
        ...workspace,
        aggregateId: projectId,
        sourceMediaId: id,
      },
      source.filename
    );
    const retained = workspaceStorageRows(project);
    const linked = workspaceStorageHead(
      project,
      withReviewWorkspaceUsage(project).usageReferenceKeys
    );
    const keys = projectWorkspaceReferenceKeys(linked, retained);
    if (keys.includes(UNKNOWN_HISTORY_REFERENCES)) return;
    for (const row of retained) await history.put(withRowReferenceMetadata(row, []));
    await workspaces.put(withRowReferenceMetadata(linked, keys));
    if (draft) {
      const moved = { ...draft, aggregateId: projectId };
      await drafts.put(
        withRowReferenceMetadata(
          moved,
          projectRowReferenceKeys(VIDEO_WORKSPACE_DRAFTS_STORE, moved)
        )
      );
      await drafts.delete(id);
    }
  }
  for (const key of oldKeys) await history.delete(key);
  await workspaces.delete(id);
}

/** Queue only native requests so failure rolls the source data and schema back together. */
export function installLegacyLibraryProjectMigration(tx: UpgradeTransaction): undefined {
  void (async () => {
    const backfill = readPendingDeletionReferenceBackfill(tx);
    if (backfill) await backfill;
    await visit(tx.objectStore(IMAGE_WORKSPACES_STORE), (row) => migrateImage(tx, row));
    await visit(tx.objectStore(VIDEO_WORKSPACES_STORE), (row) => migrateQuickEdit(tx, row));
  })().catch(() => {
    try {
      tx.abort();
    } catch {
      /* The failed native request can already have aborted the upgrade. */
    }
  });
  return undefined;
}

/** Estimate temporary row copies without reading or rewriting original media bytes. */
export async function estimateLegacyLibraryProjectBytes(source?: DatabaseMigrationSource) {
  let bytes = 64 * 1024;
  if (!source) return bytes;
  for (const name of [
    IMAGE_WORKSPACES_STORE,
    VIDEO_WORKSPACES_STORE,
    VIDEO_WORKSPACE_HISTORY_STORE,
  ]) {
    let store;
    try {
      store = source.transaction(name, 'readonly').store;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') continue;
      throw error;
    }
    let cursor = await store.openCursor();
    while (cursor) {
      bytes += JSON.stringify(cursor.value).length * 4 + 1024;
      cursor = await cursor.continue();
    }
  }
  return bytes;
}
