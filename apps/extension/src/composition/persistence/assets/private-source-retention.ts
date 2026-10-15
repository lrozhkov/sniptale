import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  PROJECT_ASSETS_STORE,
  MEDIA_LIBRARY_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  IMAGE_WORKSPACES_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  PROJECT_EXPORT_INPUTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import type { IndexedDbWriteTransaction } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseProjectAssetEntry } from '../projects/read-guards';
import type { StoredProjectAssetEntry } from '../projects/contracts';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { readAllWorkspaceStorage } from '../review-workspaces/storage';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import {
  scenarioChildIsUnrelated,
  videoEntryIsUnrelated,
  reviewWorkspaceUsesMedia,
} from '../media-library/dependencies';
import { parsePhysicalDeleteAssetOperation } from './guards';
import { readyJournalClaimsAsset } from './retention-claims';
import type { AssetReadyJournal, PhysicalDeleteAssetOperation } from './contracts';
import type { collectDurableAssetSnapshot } from './retention-authority';

type RetentionSnapshot = Awaited<ReturnType<typeof collectDurableAssetSnapshot>>;
type PrivateSource = NonNullable<PhysicalDeleteAssetOperation['privateSources']>[number];
interface DurableSourceRoots {
  videos: unknown[];
  children: unknown[];
  reviews: unknown[];
  inputs: unknown[];
}
const STORES = [
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  PROJECT_ASSETS_STORE,
  MEDIA_LIBRARY_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  IMAGE_WORKSPACES_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  PROJECT_EXPORT_INPUTS_STORE,
];

/** Record only old-minus-new source identities in the caller's authoritative mutation. */
export async function enqueuePrivateSourceRetirement(
  tx: Pick<IndexedDbWriteTransaction, 'objectStore'>,
  projectAssetIds: Iterable<string>,
  operation: PhysicalDeleteAssetOperation
): Promise<void> {
  for (const projectAssetId of new Set(projectAssetIds)) {
    const source = parseProjectAssetEntry(
      await tx.objectStore(PROJECT_ASSETS_STORE).get(projectAssetId)
    );
    if (!source) continue;
    operation.privateSources ??= [];
    operation.privateSources.push({ projectAssetId, expectedAssetId: source.assetId });
  }
}

/** Under lifecycle and exclusive reader locks, release only the exact causal private binding. */
export async function releaseExpiredPrivateSources(
  operation: PhysicalDeleteAssetOperation,
  snapshot: RetentionSnapshot,
  journals: readonly AssetReadyJournal[]
): Promise<PhysicalDeleteAssetOperation> {
  if (!operation.privateSources?.length || !snapshot.authorityValid) return operation;
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(STORES, 'readwrite');
    try {
      const operations = tx.objectStore(ASSET_OPERATIONS_STORE);
      const current = parsePhysicalDeleteAssetOperation(
        await operations.get(operation.operationId)
      );
      if (!current) {
        await tx.done;
        return operation;
      }
      const [videos, children, reviews, inputs] = await Promise.all([
        tx.objectStore(VIDEO_PROJECTS_STORE).getAll(),
        tx.objectStore(SCENARIO_ASSETS_STORE).getAll(),
        readAllWorkspaceStorage(tx),
        tx.objectStore(PROJECT_EXPORT_INPUTS_STORE).getAll(),
      ]);
      const pending: NonNullable<PhysicalDeleteAssetOperation['privateSources']> = [];
      const assetIds = new Set(current.assetIds);
      for (const candidate of current.privateSources ?? []) {
        const { projectAssetId, expectedAssetId } = candidate;
        const assets = tx.objectStore(PROJECT_ASSETS_STORE);
        const raw: unknown = await assets.get(projectAssetId);
        if (raw === undefined) {
          assetIds.add(expectedAssetId);
          continue;
        }
        const source = parseProjectAssetEntry(raw);
        // A changed binding ends this causal candidate; it never authorizes deleting its replacement.
        if (source && source.assetId !== expectedAssetId) continue;
        if (
          !sourceBindingIsRetirable(source, candidate, snapshot, journals) ||
          (await sourceHasDurableReferences(tx, projectAssetId, {
            videos,
            children,
            reviews,
            inputs,
          }))
        ) {
          pending.push(candidate);
          continue;
        }
        await assets.delete(projectAssetId);
        const owners = tx.objectStore(ASSET_OWNERS_STORE);
        await owners.delete(['project-asset', projectAssetId, 'body']);
        if ((await owners.index('assetId').count(expectedAssetId)) === 0) {
          await tx.objectStore(ASSET_REFS_STORE).delete(expectedAssetId);
          assetIds.add(expectedAssetId);
        }
      }
      const next = {
        ...current,
        assetIds: [...assetIds],
        privateSources: pending,
        updatedAt: Date.now(),
      };
      await operations.put(next);
      await tx.done;
      return next;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* An aborted transaction may already be inactive. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

/** Immutable binding and in-flight claims must agree before any logical source mutation. */
function sourceBindingIsRetirable(
  source: StoredProjectAssetEntry | null,
  candidate: PrivateSource,
  snapshot: RetentionSnapshot,
  journals: readonly AssetReadyJournal[]
): boolean {
  const { projectAssetId, expectedAssetId } = candidate;
  const owner = snapshot.owners.find(
    (entry) =>
      entry.ownerKind === 'project-asset' &&
      entry.ownerId === projectAssetId &&
      entry.role === 'body'
  );
  const ref = snapshot.refs.find((entry) => entry.assetId === expectedAssetId);
  return (
    source !== null &&
    source.id === projectAssetId &&
    owner?.assetId === expectedAssetId &&
    ref !== undefined &&
    ref.mimeType === source.mimeType &&
    ref.size === source.size &&
    !snapshot.protectedRollbackAssetIds.has(expectedAssetId) &&
    !snapshot.publishedProjectAssetIds.has(projectAssetId) &&
    retainedOwnerProjectionIsConsistent(candidate, snapshot) &&
    !journals.some((journal) => readyJournalClaimsAsset(journal, expectedAssetId))
  );
}

/** Fresh logical roots include detached export handoff; an own sidecar is a retained root. */
async function sourceHasDurableReferences(
  tx: IndexedDbWriteTransaction,
  projectAssetId: string,
  roots: DurableSourceRoots
): Promise<boolean> {
  const id = createProjectAssetMediaId(projectAssetId);
  const target = { id, source: { kind: 'project-asset' as const, projectAssetId } };
  const sidecars = await Promise.all(
    [MEDIA_LIBRARY_STORE, IMAGE_WORKSPACES_STORE, VIDEO_WORKSPACES_STORE].map((store) =>
      tx.objectStore(store).get(id)
    )
  );
  return (
    sidecars.some((value) => value !== undefined) ||
    roots.children.some((child) => !scenarioChildIsUnrelated(child, target)) ||
    [...roots.videos, ...roots.inputs].some(
      (video) => !videoEntryIsUnrelated(video, target, new Set())
    ) ||
    roots.reviews.some((raw) => {
      const workspace = parseVideoWorkspace(raw);
      return !workspace || reviewWorkspaceUsesMedia(workspace, target);
    })
  );
}

/** Missing or conflicting ownership evidence keeps the causal source and immutable reference. */
function retainedOwnerProjectionIsConsistent(
  candidate: PrivateSource,
  snapshot: RetentionSnapshot
): boolean {
  return snapshot.expectedOwners.every((expected) => {
    if (expected.assetId !== candidate.expectedAssetId) return true;
    if (
      expected.ownerKind === 'project-asset' &&
      expected.ownerId === candidate.projectAssetId &&
      expected.role === 'body'
    )
      return true;
    return snapshot.owners.some(
      (actual) =>
        actual.assetId === expected.assetId &&
        actual.ownerKind === expected.ownerKind &&
        actual.ownerId === expected.ownerId &&
        actual.role === expected.role
    );
  });
}
