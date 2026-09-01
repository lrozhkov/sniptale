import { discardPreparedAsset, type PhysicalDeleteAssetOperation } from '../assets';
import {
  preparePersistedEditorDocument,
  removeEditorDocumentOwnership,
  replaceEditorDocumentAssetOwnership,
} from '../document-assets';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
} from '../infrastructure/indexed-db/core';
import type { initDB } from '../infrastructure/indexed-db/core';
import type {
  PreparedScenarioAggregateChildMutation,
  PreparedScenarioStepEditorDocumentEntry,
  ScenarioAggregateChildMutation,
} from './asset-staging';
import { parseScenarioStepEditorDocumentEntry } from './editor-documents/index.guards';

export const SCENARIO_EDITOR_DOCUMENT_OWNER_KIND = 'scenario-editor-document';
type ScenarioAggregateTransaction = ReturnType<Awaited<ReturnType<typeof initDB>>['transaction']>;

async function discardPreparedEditorDocumentAssets(
  entries: readonly PreparedScenarioStepEditorDocumentEntry[]
): Promise<unknown[]> {
  const cleanup = await Promise.allSettled(
    entries.flatMap((entry) => entry.assetRefs.map((ref) => discardPreparedAsset(ref.assetId)))
  );
  return cleanup.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
}

export async function prepareScenarioEditorDocumentMutations(
  children: ScenarioAggregateChildMutation | undefined
): Promise<PreparedScenarioAggregateChildMutation | undefined> {
  if (!children) return undefined;
  const preparedDocuments: PreparedScenarioStepEditorDocumentEntry[] = [];
  try {
    for (const entry of children.editorDocumentPuts ?? []) {
      const prepared = await preparePersistedEditorDocument(entry.document);
      preparedDocuments.push({
        ...entry,
        document: prepared.document,
        assetRefs: prepared.objects.map(({ ref }) => ref),
      });
    }
    return {
      ...(children.assetDeletes ? { assetDeletes: children.assetDeletes } : {}),
      ...(children.assetPuts ? { assetPuts: children.assetPuts } : {}),
      ...(children.editorDocumentDeletes
        ? { editorDocumentDeletes: children.editorDocumentDeletes }
        : {}),
      ...(preparedDocuments.length > 0 ? { editorDocumentPuts: preparedDocuments } : {}),
    };
  } catch (error) {
    const failures = await discardPreparedEditorDocumentAssets(preparedDocuments);
    if (failures.length > 0) {
      throw new AggregateError(
        [error, ...failures],
        'Scenario editor document preparation and cleanup failed.',
        { cause: error }
      );
    }
    throw error;
  }
}

export async function discardPreparedScenarioEditorDocuments(
  children: PreparedScenarioAggregateChildMutation | undefined
): Promise<void> {
  const failures = await discardPreparedEditorDocumentAssets(children?.editorDocumentPuts ?? []);
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Failed to discard scenario editor document assets.');
  }
}

export async function applyScenarioDocumentMutations(args: {
  children: PreparedScenarioAggregateChildMutation | undefined;
  physicalDelete: PhysicalDeleteAssetOperation;
  projectId: string;
  tx: ScenarioAggregateTransaction;
  updatedAt: number;
}): Promise<void> {
  const { children, physicalDelete, projectId, tx, updatedAt } = args;
  if (
    (children?.editorDocumentPuts?.length ?? 0) === 0 &&
    (children?.editorDocumentDeletes?.length ?? 0) === 0
  ) {
    return;
  }
  const documentStore = tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE);
  const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
  const refStore = tx.objectStore(ASSET_REFS_STORE);
  for (const document of children?.editorDocumentPuts ?? []) {
    const rawDocument: unknown = await documentStore.get!(document.stepId);
    const existingDocument = parseScenarioStepEditorDocumentEntry(rawDocument);
    if (
      rawDocument !== undefined &&
      (!existingDocument || existingDocument.projectId !== projectId)
    ) {
      throw new Error(
        `Scenario editor document ${document.stepId} does not belong to project ${projectId}.`
      );
    }
    await replaceEditorDocumentAssetOwnership({
      nextDocument: document.document,
      nextRefs: document.assetRefs,
      ownerId: document.stepId,
      ownerKind: SCENARIO_EDITOR_DOCUMENT_OWNER_KIND,
      previousDocument: existingDocument?.document ?? null,
      physicalDelete,
      stores: { owners: ownerStore, refs: refStore },
    });
    const { assetRefs: _assetRefs, ...storedDocument } = document;
    await documentStore.put!({
      ...storedDocument,
      createdAt: existingDocument?.createdAt ?? (document.createdAt || updatedAt),
      updatedAt,
    });
  }
  for (const stepId of children?.editorDocumentDeletes ?? []) {
    const rawDocument: unknown = await documentStore.get!(stepId);
    const document = parseScenarioStepEditorDocumentEntry(rawDocument);
    if (rawDocument !== undefined && (!document || document.projectId !== projectId)) {
      throw new Error(
        `Scenario editor document ${stepId} does not belong to project ${projectId}.`
      );
    }
    if (document) {
      await removeEditorDocumentOwnership({
        document: document.document,
        ownerId: stepId,
        ownerKind: SCENARIO_EDITOR_DOCUMENT_OWNER_KIND,
        physicalDelete,
        stores: { owners: ownerStore, refs: refStore },
      });
    }
    await documentStore.delete!(stepId);
  }
  if (physicalDelete.assetIds.length > 0) {
    await tx.objectStore(ASSET_OPERATIONS_STORE).put!(physicalDelete);
  }
}
