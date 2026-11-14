import {
  parseAnimationTemplateSource,
  verifyAnimationResource,
} from '@sniptale/runtime-contracts/animation-template';

/** Embedded source resources survive Trash and archive duplicate restore without a catalogue. */
export async function portableProbe(aggregateId: string) {
  const { readVideoWorkspace } =
    await import('../../../../apps/extension/src/composition/persistence/review-workspaces/store');
  const { initDB, VIDEO_WORKSPACES_STORE } =
    await import('../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core');
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
  const resources = [];
  for (const snapshot of duplicate.workspace.effectSnapshots) {
    const template = parseAnimationTemplateSource(snapshot.source).template;
    if (!template || snapshot.assets.length) throw new Error('Expected self-contained animation.');
    const prior = original.workspace.effectSnapshots.find((entry) => entry.id === snapshot.id);
    const originalTemplate = prior ? parseAnimationTemplateSource(prior.source).template : null;
    for (const resource of template.resources)
      resources.push({
        path: resource.path,
        mimeType: resource.mimeType,
        exact:
          (await verifyAnimationResource(resource)) &&
          !!originalTemplate?.resources.some(
            (old) =>
              old.path === resource.path &&
              old.sha256 === resource.sha256 &&
              old.base64 === resource.base64
          ),
        embedded: snapshot.source.includes(resource.base64),
      });
  }
  const discarded = await discardedSourceProbe(newIds[0]);
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
    resources,
    detachedAssets: duplicate.workspace.effectSnapshots.reduce(
      (count, snapshot) => count + snapshot.assets.length,
      0
    ),
  };
}

/** Source-only Undo and branch pruning leave unrelated physical rows intact. */
async function discardedSourceProbe(aggregateId: string) {
  const { readVideoWorkspace, moveVideoWorkspaceHistory, commitVideoWorkspace } =
    await import('../../../../apps/extension/src/composition/persistence/review-workspaces/store');
  const { initDB, MEDIA_LIBRARY_STORE } =
    await import('../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core');
  const { deleteVideoWorkspaceProject } =
    await import('../../../../apps/extension/src/composition/persistence/review-workspaces/project-commands');
  const { deleteMediaAssetWithProjectCascade } =
    await import('../../../../apps/extension/src/composition/persistence/media-library/delete-cascade');
  const db = await initDB();
  const adopted = await readVideoWorkspace(aggregateId);
  if (!adopted?.workspace.effectSnapshots?.length) throw new Error('Adopted source missing.');
  const snapshots = adopted.workspace.effectSnapshots;
  const embeddedResources = snapshots.flatMap((snapshot) => {
    const template = parseAnimationTemplateSource(snapshot.source).template;
    if (!template || snapshot.assets.length) throw new Error('Expected self-contained source.');
    return template.resources;
  });
  const physicalRows = JSON.stringify(await db.getAll('project_assets'));
  const undone = await moveVideoWorkspaceHistory({
    aggregateId,
    expectedRevision: adopted.workspace.revision,
    expectedSourceAssetId: adopted.workspace.sourceAssetId,
    direction: 'start',
  });
  const redoRetained =
    JSON.stringify(undone.workspace.effectSnapshots) === JSON.stringify(snapshots);
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
        text: 'Retained-source branch proof',
        anchor: { kind: 'point', time: 0 },
      },
    },
  });
  const detachedRowsUnchanged = JSON.stringify(await db.getAll('project_assets')) === physicalRows;
  const registryPruned = !branch.workspace.effectSnapshots?.length;
  const sourceBytesReleased = embeddedResources.every(
    (resource) => !JSON.stringify(branch.workspace).includes(resource.base64)
  );
  await deleteVideoWorkspaceProject(aggregateId, branch.workspace.revision);
  await deleteMediaAssetWithProjectCascade(aggregateId, []);
  const parentPurged = (await db.get(MEDIA_LIBRARY_STORE, aggregateId)) === undefined;
  const sourceAbsent = (await readVideoWorkspace(aggregateId)) === null;
  if (
    embeddedResources.length !== 3 ||
    embeddedResources.filter((resource) => resource.mimeType.startsWith('image/')).length !== 2 ||
    embeddedResources.filter((resource) => resource.mimeType.startsWith('font/')).length !== 1 ||
    !redoRetained ||
    !registryPruned ||
    !detachedRowsUnchanged ||
    !sourceBytesReleased ||
    !parentPurged ||
    !sourceAbsent
  ) {
    const facts = {
      resources: embeddedResources.length,
      redoRetained,
      registryPruned,
      detachedRowsUnchanged,
      sourceBytesReleased,
      parentPurged,
      sourceAbsent,
    };
    throw new Error(`Embedded source branch/purge cleanup failed: ${JSON.stringify(facts)}`);
  }
  return {
    resources: embeddedResources.length,
    redoRetained,
    registryPruned,
    detachedRowsUnchanged,
    sourceBytesReleased,
    parentPurged,
    sourceAbsent,
  };
}
