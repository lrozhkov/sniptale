import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { removeEditorDocumentOwnership } from '../document-assets';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { SCENARIO_ASSET_OWNER_KIND, SCENARIO_ASSET_ROLE } from './asset-staging';
import { recoverScenarioAssetPublications } from './aggregate-mutations';
import { SCENARIO_EDITOR_DOCUMENT_OWNER_KIND } from './editor-document-staging';
import { parseScenarioStepEditorDocumentEntry } from './editor-documents/index.guards';
import { parseScenarioAssetEntry, parseScenarioExportEntry } from './read-guards';

export async function deleteOrphanedScenarioAggregateChild(args: {
  id: string;
  kind: 'asset' | 'editor-document';
}): Promise<void> {
  await recoverScenarioAssetPublications();
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const childStoreName =
      args.kind === 'asset' ? SCENARIO_ASSETS_STORE : SCENARIO_STEP_EDITOR_DOCUMENTS_STORE;
    const tx = db.transaction(
      [
        SCENARIO_PROJECTS_STORE,
        childStoreName,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const childStore = tx.objectStore(childStoreName);
    const rawChild: unknown = await childStore.get(args.id);
    const child =
      args.kind === 'asset'
        ? parseScenarioAssetEntry(rawChild)
        : parseScenarioStepEditorDocumentEntry(rawChild);
    if (!child) {
      if (rawChild !== undefined) {
        throw new Error(`Invalid scenario ${args.kind} cannot be safely removed.`);
      }
      await tx.done;
      return;
    }
    const projectId = child.projectId;
    if (await tx.objectStore(SCENARIO_PROJECTS_STORE).get(projectId)) {
      throw new Error(`Scenario ${args.kind} ${args.id} still belongs to aggregate ${projectId}.`);
    }
    await childStore.delete(args.id);
    if (args.kind === 'asset' && 'assetId' in child) {
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      await ownerStore.delete([SCENARIO_ASSET_OWNER_KIND, args.id, SCENARIO_ASSET_ROLE]);
      if ((await ownerStore.index('assetId').count(child.assetId)) === 0) {
        await tx.objectStore(ASSET_REFS_STORE).delete(child.assetId);
        physicalDelete.assetIds.push(child.assetId);
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
      }
    } else if (args.kind === 'editor-document' && 'document' in child) {
      await removeEditorDocumentOwnership({
        document: child.document,
        ownerId: args.id,
        ownerKind: SCENARIO_EDITOR_DOCUMENT_OWNER_KIND,
        physicalDelete,
        stores: {
          owners: tx.objectStore(ASSET_OWNERS_STORE),
          refs: tx.objectStore(ASSET_REFS_STORE),
        },
      });
      if (physicalDelete.assetIds.length > 0) {
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
      }
    }
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
}

export async function deleteScenarioAggregate(projectId: string): Promise<void> {
  await recoverScenarioAssetPublications();
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        SCENARIO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
        SCENARIO_EXPORTS_STORE,
        SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const [rawAssets, rawExports, rawDocuments] = await Promise.all([
      tx.objectStore(SCENARIO_ASSETS_STORE).index!('projectId').getAll(projectId),
      tx.objectStore(SCENARIO_EXPORTS_STORE).index!('projectId').getAll(projectId),
      tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).index!('projectId').getAll(projectId),
    ]);
    const assetIds = rawAssets.flatMap((value) => {
      const parsed = parseScenarioAssetEntry(value);
      const id = parsed?.id ?? readOwnedScenarioChildId(value, projectId);
      return id ? [id] : [];
    });
    const exportIds = rawExports.flatMap((value) => {
      const parsed = parseScenarioExportEntry(value);
      const id = parsed?.id ?? readOwnedScenarioChildId(value, projectId);
      return id ? [id] : [];
    });
    const documentIds = rawDocuments.flatMap((value) => {
      const parsed = parseScenarioStepEditorDocumentEntry(value);
      const stepId = parsed?.stepId ?? readOwnedScenarioStepId(value, projectId);
      return stepId ? [stepId] : [];
    });
    await tx.objectStore(SCENARIO_PROJECTS_STORE).delete(projectId);
    const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
    for (const assetId of assetIds) {
      const asset = parseScenarioAssetEntry(
        await tx.objectStore(SCENARIO_ASSETS_STORE).get(assetId)
      );
      await tx.objectStore(SCENARIO_ASSETS_STORE).delete(assetId);
      if (asset) {
        await ownerStore.delete([SCENARIO_ASSET_OWNER_KIND, assetId, SCENARIO_ASSET_ROLE]);
        if ((await ownerStore.index('assetId').count(asset.assetId)) === 0) {
          await tx.objectStore(ASSET_REFS_STORE).delete(asset.assetId);
          physicalDelete.assetIds.push(asset.assetId);
        }
      }
    }
    for (const exportId of exportIds) await tx.objectStore(SCENARIO_EXPORTS_STORE).delete(exportId);
    for (const stepId of documentIds) {
      const document = parseScenarioStepEditorDocumentEntry(
        await tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).get(stepId)
      );
      if (document) {
        await removeEditorDocumentOwnership({
          document: document.document,
          ownerId: stepId,
          ownerKind: SCENARIO_EDITOR_DOCUMENT_OWNER_KIND,
          physicalDelete,
          stores: {
            owners: tx.objectStore(ASSET_OWNERS_STORE),
            refs: tx.objectStore(ASSET_REFS_STORE),
          },
        });
      }
      await tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).delete(stepId);
    }
    await tx
      .objectStore(AGGREGATE_PRESENTATIONS_STORE)
      .delete(createAggregatePresentationKey({ id: projectId, kind: 'scenario' }));
    if (physicalDelete.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
    }
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
}

function readOwnedScenarioChildId(value: unknown, projectId: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record['projectId'] === projectId && typeof record['id'] === 'string'
    ? record['id']
    : null;
}

function readOwnedScenarioStepId(value: unknown, projectId: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record['projectId'] === projectId && typeof record['stepId'] === 'string'
    ? record['stepId']
    : null;
}
