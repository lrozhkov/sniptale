import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';

/** Retained native PNG/SVG closure survives Trash and real archive duplicate restore without a catalog. */
export async function portableProbe(aggregateId: string) {
  const { readVideoWorkspace } =
    await import('../../../../apps/extension/src/composition/persistence/review-workspaces/store');
  const { initDB, VIDEO_WORKSPACES_STORE } =
    await import('../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core');
  const { getProjectAsset } =
    await import('../../../../apps/extension/src/composition/persistence/projects');
  const { moveStoredItemsToTrash, restoreStoredItemsFromTrash } =
    await import('../../../../apps/extension/src/composition/persistence/library-lifecycle/trash');
  const { createMediaHubBackupExportOptions } =
    await import('../../../../apps/extension/src/workflows/media-hub-backup/v6/options');
  const { buildMediaHubBackupExportPlanFromLibraryV6 } =
    await import('../../../../apps/extension/src/workflows/media-hub-backup/v6/inventory');
  const { exportMediaHubBackupV6 } =
    await import('../../../../apps/extension/src/workflows/media-hub-backup/v6/export');
  const { inspectMediaHubBackupV6 } =
    await import('../../../../apps/extension/src/workflows/media-hub-backup/v6/inspect');
  const { importMediaHubBackup } =
    await import('../../../../apps/extension/src/workflows/media-hub-backup/v6/public');
  const { createArchiveMemorySink } =
    await import('../../../../apps/extension/src/composition/archive-transfer/test-support');
  const original = await readVideoWorkspace(aggregateId);
  if (!original?.workspace.effectSnapshots?.length)
    throw new Error('Native annotation source absent');
  const before = JSON.stringify(original);
  await moveStoredItemsToTrash([{ kind: 'media', id: aggregateId }]);
  const trashed = await readVideoWorkspace(aggregateId);
  await restoreStoredItemsFromTrash([{ kind: 'media', id: aggregateId }]);
  const restored = await readVideoWorkspace(aggregateId);
  const plan = await buildMediaHubBackupExportPlanFromLibraryV6(
    createMediaHubBackupExportOptions({
      scope: 'selected',
      selected: { mediaAssetIds: [aggregateId], scenarioProjectIds: [], videoProjectIds: [] },
    })
  );
  const sink = createArchiveMemorySink();
  await exportMediaHubBackupV6({ plan, sink: sink.sink });
  const file = sink.blob();
  const inspection = await inspectMediaHubBackupV6(file);
  const db = await initDB();
  const previousIds = new Set(await db.getAllKeys(VIDEO_WORKSPACES_STORE));
  const result = await importMediaHubBackup(file, 'duplicate');
  const currentIds = await db.getAllKeys(VIDEO_WORKSPACES_STORE);
  const newIds = currentIds.filter((id) => !previousIds.has(id));
  if (newIds.length !== 1 || typeof newIds[0] !== 'string')
    throw new Error('Duplicated annotation workspace absent');
  const duplicate = await readVideoWorkspace(newIds[0]);
  if (!duplicate?.workspace.effectSnapshots?.length)
    throw new Error('Duplicated native source absent');
  const assets = [];
  for (const snapshot of duplicate.workspace.effectSnapshots)
    for (const asset of snapshot.assets) {
      const value = await getProjectAsset(asset.assetId.slice('project-asset:'.length));
      if (value.status !== 'ready') throw new Error('Duplicated native bytes unavailable');
      const sha256 = await sha256EffectV1Bytes(
        new Uint8Array(await value.entry.file.arrayBuffer())
      );
      assets.push({
        mimeType: asset.mimeType,
        exact: sha256 === asset.sha256 && value.entry.file.size === asset.byteLength,
        rebound: !original.workspace.effectSnapshots.some((source) =>
          source.assets.some((old) => old.assetId === asset.assetId)
        ),
      });
    }
  const discarded = await discardedResourceProbe(newIds[0]);
  return {
    discarded,
    archiveBytes: file.size,
    imported: result.imported,
    roots: inspection.descriptors.length,
    catalogRoots: inspection.descriptors.filter(
      (entry) => entry.rootKind === 'media' && entry.mediaSubtype === 'effect-bundle'
    ).length,
    trashUnchanged: JSON.stringify(trashed) === before,
    restoredUnchanged: JSON.stringify(restored) === before,
    sourceUnchanged: JSON.stringify(await readVideoWorkspace(aggregateId)) === before,
    completeHistory:
      JSON.stringify(duplicate.workspace.history) === JSON.stringify(original.workspace.history),
    cursor: duplicate.workspace.cursor,
    expectedCursor: original.workspace.cursor,
    exactSource: duplicate.workspace.effectSnapshots.every((snapshot) =>
      original.workspace.effectSnapshots?.some(
        (entry) => entry.id === snapshot.id && entry.source === snapshot.source
      )
    ),
    assets,
  };
}

/** Real adopted resources survive Undo, then release before parent purge after a new branch. */
async function discardedResourceProbe(aggregateId: string) {
  const { readVideoWorkspace, moveVideoWorkspaceHistory, commitVideoWorkspace } =
    await import('../../../../apps/extension/src/composition/persistence/review-workspaces/store');
  const {
    initDB,
    PROJECT_ASSETS_STORE,
    ASSET_REFS_STORE,
    ASSET_OWNERS_STORE,
    MEDIA_LIBRARY_STORE,
  } =
    await import('../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core');
  const { parseProjectAssetEntry } =
    await import('../../../../apps/extension/src/composition/persistence/projects/read-guards');
  const { parseAssetRef, readAssetFile, MissingAssetObjectError } =
    await import('../../../../apps/extension/src/composition/persistence/assets');
  const { deleteVideoWorkspaceProject } =
    await import('../../../../apps/extension/src/composition/persistence/review-workspaces/project-commands');
  const { deleteMediaAssetWithProjectCascade } =
    await import('../../../../apps/extension/src/composition/persistence/media-library/delete-cascade');
  const db = await initDB();
  const adopted = await readVideoWorkspace(aggregateId);
  if (!adopted) throw new Error('Adopted review unavailable');
  const resources = [];
  for (const snapshot of adopted.workspace.effectSnapshots ?? [])
    for (const asset of snapshot.assets) {
      const id = asset.assetId.slice('project-asset:'.length);
      const entry = parseProjectAssetEntry(await db.get(PROJECT_ASSETS_STORE, id));
      const ref = entry ? parseAssetRef(await db.get(ASSET_REFS_STORE, entry.assetId)) : null;
      if (!ref) throw new Error('Adopted private resource unavailable');
      await readAssetFile(ref, 'before-discard');
      resources.push({ id, ref });
    }
  const undone = await moveVideoWorkspaceHistory({
    aggregateId,
    expectedRevision: adopted.workspace.revision,
    expectedSourceAssetId: adopted.workspace.sourceAssetId,
    direction: 'start',
  });
  const redoRetained =
    undone.workspace.effectSnapshots?.length === adopted.workspace.effectSnapshots?.length &&
    (
      await Promise.all(
        resources.map(
          async ({ id, ref }) =>
            !!(await db.get(PROJECT_ASSETS_STORE, id)) &&
            (await readAssetFile(ref, 'redo')).size === ref.size
        )
      )
    ).every(Boolean);
  const branch = await commitVideoWorkspace({
    aggregateId,
    expectedRevision: undone.workspace.revision,
    expectedSourceAssetId: undone.workspace.sourceAssetId,
    operation: {
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'annotation',
      before: null,
      after: {
        id: crypto.randomUUID(),
        text: 'Retained-resource branch proof',
        anchor: { kind: 'point', time: 0 },
      },
    },
  });
  const rowsReleased = (
    await Promise.all(
      resources.map(
        async ({ id, ref }) =>
          (await db.get(PROJECT_ASSETS_STORE, id)) === undefined &&
          (await db.get(ASSET_REFS_STORE, ref.assetId)) === undefined &&
          (await db.get(ASSET_OWNERS_STORE, ['project-asset', id, 'body'])) === undefined
      )
    )
  ).every(Boolean);
  const bytesAbsent = async () =>
    (
      await Promise.all(
        resources.map(async ({ ref }) => {
          try {
            await readAssetFile(ref, 'after-discard');
            return false;
          } catch (error) {
            return (
              error instanceof MissingAssetObjectError ||
              (error instanceof DOMException && error.name === 'NotFoundError')
            );
          }
        })
      )
    ).every(Boolean);
  const branchBytesReleased = await bytesAbsent();
  await deleteVideoWorkspaceProject(aggregateId, branch.workspace.revision);
  await deleteMediaAssetWithProjectCascade(aggregateId, []);
  const parentPurged = (await db.get(MEDIA_LIBRARY_STORE, aggregateId)) === undefined;
  const purgeBytesAbsent = await bytesAbsent();
  if (
    resources.length !== 2 ||
    !redoRetained ||
    branch.workspace.effectSnapshots?.length ||
    !rowsReleased ||
    !branchBytesReleased ||
    !parentPurged ||
    !purgeBytesAbsent
  )
    throw new Error('Adopted annotation branch/purge cleanup failed');
  return {
    resources: resources.length,
    redoRetained,
    registryPruned: !branch.workspace.effectSnapshots?.length,
    rowsReleased,
    branchBytesReleased,
    parentPurged,
    purgeBytesAbsent,
  };
}
