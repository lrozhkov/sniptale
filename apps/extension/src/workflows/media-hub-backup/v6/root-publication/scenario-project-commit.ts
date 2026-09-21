import {
  appendCommittedArchiveRootInTransaction,
  completePhysicalDeleteOperation,
  type ArchiveRestoreSession,
} from '../../../../composition/persistence/assets';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { initDB } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import { putScenarioProjectBackupRestore } from '../../../../composition/persistence/scenario/backup-restore';
import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';
import { scenarioAssetRestoreKey } from '../reference-keys';
import type { ArchiveRootPublicationResult } from '../restore';
import type { PreparedScenarioPublication } from './scenario-project-publication';

type ScenarioProjectPublicationTransaction = ReturnType<
  Awaited<ReturnType<typeof initDB>>['transaction']
>;

async function checkpointScenarioChildren(
  tx: ScenarioProjectPublicationTransaction,
  prepared: PreparedScenarioPublication,
  imported: boolean
): Promise<Record<string, string>> {
  if (imported) {
    return Object.fromEntries(
      [...prepared.assetIds].map(([sourceId, targetId]) => [
        scenarioAssetRestoreKey(sourceId),
        targetId,
      ])
    );
  }
  const childIds: Record<string, string> = {};
  for (const item of prepared.metadata.assets) {
    const existing = parseScenarioAssetEntry(
      await tx.objectStore(SCENARIO_ASSETS_STORE).get(item.entry.id)
    );
    if (existing?.projectId === prepared.targetProjectId) {
      childIds[scenarioAssetRestoreKey(item.entry.id)] = existing.id;
    }
  }
  return childIds;
}

export async function commitScenarioProjectPublication(
  prepared: PreparedScenarioPublication,
  session: ArchiveRestoreSession
): Promise<ArchiveRootPublicationResult> {
  const result = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        SCENARIO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
        SCENARIO_EXPORTS_STORE,
        SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
        THUMBNAILS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const restored = await putScenarioProjectBackupRestore({
      operation: prepared.operation,
      root: prepared.root,
      stores: {
        assets: tx.objectStore(SCENARIO_ASSETS_STORE),
        exports: tx.objectStore(SCENARIO_EXPORTS_STORE),
        operations: tx.objectStore(ASSET_OPERATIONS_STORE),
        owners: tx.objectStore(ASSET_OWNERS_STORE),
        presentations: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
        projects: tx.objectStore(SCENARIO_PROJECTS_STORE),
        refs: tx.objectStore(ASSET_REFS_STORE),
        stepDocuments: tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE),
        thumbnails: tx.objectStore(THUMBNAILS_STORE),
      },
      strategy: session.strategy,
    });
    const childIds = await checkpointScenarioChildren(tx, prepared, restored.imported);
    if (prepared.operation.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(prepared.operation);
    }
    await appendCommittedArchiveRootInTransaction(
      tx.objectStore(ASSET_OPERATIONS_STORE),
      session.operationId,
      {
        childIds,
        conflicted: restored.conflicted,
        imported: restored.imported,
        rootKey: prepared.rootKey,
        targetRootId: prepared.targetProjectId,
      }
    );
    await tx.done;
    return restored;
  });
  if (prepared.operation.assetIds.length > 0) {
    await completePhysicalDeleteOperation(prepared.operation).catch(() => undefined);
  }
  return {
    conflicted: result.conflicted,
    imported: result.imported,
    retainedAssetIds: result.imported
      ? [
          ...prepared.root.assets.map((asset) => asset.ref.assetId),
          ...prepared.root.stepDocuments.flatMap((document) =>
            document.refs.map((ref) => ref.assetId)
          ),
        ]
      : [],
  };
}
