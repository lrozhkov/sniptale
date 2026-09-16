import { getScenarioResourceReferences } from '../../../features/scenario/project/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  SCENARIO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import {
  applyScenarioAssetMutations,
  recoverScenarioAssetPublications,
} from './aggregate-mutations';
import { applyScenarioDocumentMutations } from './editor-document-staging';
import { parseScenarioStepEditorDocumentEntry } from './editor-documents/index.guards';
import { parseScenarioAssetEntry, parseScenarioProjectEntry } from './read-guards';
import { createScenarioProjectEntry } from './projects/entry';
import { tryScenarioResourceCleanup } from './resource-sessions';
import type { ScenarioProjectEntry } from './contracts';
import { publishMediaHubLibraryChanged } from '../../../features/media-hub/events';

/** Current and retained snapshots are the durable authority for logical child reachability. */
function references(projects: GuideProject[]) {
  const assets = new Set<string>();
  const documents = new Set<string>();
  for (const project of projects) {
    const refs = getScenarioResourceReferences(project);
    for (const id of refs.assets) assets.add(id);
    for (const id of refs.documents) documents.add(id);
  }
  return { assets, documents };
}

/** Explicit CAS metadata mutation; open undo sessions continue protecting their physical children. */
export async function clearScenarioSavedHistory(projectId: string, baseUpdatedAt: number) {
  await recoverScenarioAssetPublications();
  const project = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(SCENARIO_PROJECTS_STORE, 'readwrite');
    try {
      const store = tx.objectStore(SCENARIO_PROJECTS_STORE);
      const existing = parseScenarioProjectEntry(await store.get(projectId));
      if (!existing) throw new Error('Guide history is unavailable.');
      if (existing.project.updatedAt !== baseUpdatedAt) {
        const error = new Error('Guide changed before history cleanup.');
        error.name = 'StaleScenarioAggregateRevisionError';
        throw error;
      }
      if (!existing.history?.length) {
        await tx.done;
        return existing.project;
      }
      const entry = createScenarioProjectEntry({
        existing,
        project: existing.project,
        historyPolicy: 'discard',
      });
      await store.put(entry);
      await tx.done;
      return entry.project;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already have aborted. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
  publishMediaHubLibraryChanged('update', [`scenario:${projectId}`]);
  return project;
}

/** Best-effort admission, strict mutation: live sessions defer cleanup; admitted failures propagate. */
export function pruneScenarioResources(projectId: string): Promise<number | undefined> {
  return tryScenarioResourceCleanup(projectId, async () => {
    await recoverScenarioAssetPublications();
    const physicalDelete = buildPhysicalDeleteOperation([]);
    const count = await runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [
          SCENARIO_PROJECTS_STORE,
          SCENARIO_ASSETS_STORE,
          SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
          ASSET_REFS_STORE,
          ASSET_OWNERS_STORE,
          ASSET_OPERATIONS_STORE,
        ],
        'readwrite'
      );
      try {
        const store = tx.objectStore(SCENARIO_PROJECTS_STORE);
        const raw: unknown = await store.get(projectId);
        if (raw === undefined) {
          await tx.done;
          return 0;
        }
        const existing = parseScenarioProjectEntry(raw);
        if (!existing) throw new Error('Unavailable guide cannot be pruned.');
        const children = await collectUnreachableChildren(tx, existing);
        const removed = children.assetDeletes.length + children.editorDocumentDeletes.length;
        if (!removed) {
          await tx.done;
          return 0;
        }
        const entry = createScenarioProjectEntry({
          existing,
          project: existing.project,
          historyPolicy: 'preserve',
        });
        await applyScenarioAssetMutations(tx, projectId, children, physicalDelete);
        await applyScenarioDocumentMutations({
          tx,
          projectId,
          children,
          physicalDelete,
          updatedAt: entry.updatedAt,
        });
        await store.put(entry);
        await tx.done;
        return removed;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* The transaction may already have aborted. */
        }
        await tx.done.catch(() => undefined);
        throw error;
      }
    });
    if (physicalDelete.assetIds.length) await completePhysicalDeleteOperation(physicalDelete);
    return count;
  });
}

async function collectUnreachableChildren(
  tx: Parameters<typeof applyScenarioAssetMutations>[0],
  existing: ScenarioProjectEntry
) {
  const projectId = existing.id;
  const live = references([existing.project, ...(existing.history ?? []).map((v) => v.project)]);
  const assets = (
    await tx.objectStore(SCENARIO_ASSETS_STORE).index('projectId').getAll(projectId)
  ).map(parseScenarioAssetEntry);
  const documents = (
    await tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).index('projectId').getAll(projectId)
  ).map(parseScenarioStepEditorDocumentEntry);
  if (assets.some((asset) => !asset) || documents.some((document) => !document))
    throw new Error('Invalid guide children cannot be pruned.');
  const children = {
    assetDeletes: assets.flatMap((asset) =>
      asset && !live.assets.has(asset.id) ? [asset.id] : []
    ),
    editorDocumentDeletes: documents.flatMap((doc) =>
      doc && !live.documents.has(doc.stepId) ? [doc.stepId] : []
    ),
  };
  return children;
}
