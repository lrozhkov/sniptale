import { ASSET_OPERATIONS_STORE, initDB } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  deleteAssetObject,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  listAssetObjectIds,
  listReadyJournals,
  readyJournalClaimsAsset,
  listWritingAssetIds,
  runWithAssetObjectLockIfAvailable,
  type AssetOwner,
  type AssetRef,
  type ArchiveRestoreSession,
} from '../assets';
import {
  runWithDurableAssetLifecycleLock,
  tryRunWithDurableAssetLifecycleLock,
} from '../infrastructure/mutation-barrier';
import { collectDurableAssetSnapshot } from '../assets/retention-authority';

interface DurableAssetAuditReport {
  authorityValid: boolean;
  embeddedBinaryMetadata: string[];
  objectsWithoutAuthority: string[];
  orphanedJournals: string[];
  ownersWithoutRefs: AssetOwner[];
  ownerMetadataMismatches: AssetOwner[];
  refsWithoutObjects: AssetRef[];
  refsWithoutOwners: AssetRef[];
  unfinishedRestoreSessions: ArchiveRestoreSession[];
}

export async function auditDurableAssets(): Promise<DurableAssetAuditReport> {
  const [snapshot, objectIds, readyJournals, writingIds] = await Promise.all([
    collectDurableAssetSnapshot(),
    listAssetObjectIds(),
    listReadyJournals(),
    listWritingAssetIds(),
  ]);
  const refsById = new Map(snapshot.refs.map((ref) => [ref.assetId, ref]));
  const objectIdSet = new Set(objectIds);
  const ownedAssetIds = new Set(snapshot.owners.map((owner) => owner.assetId));
  const actualOwnersByKey = new Map(snapshot.owners.map((owner) => [ownerKey(owner), owner]));
  const ownerMetadataMismatches = new Map<string, AssetOwner>();
  for (const owner of snapshot.owners) {
    if (snapshot.expectedOwnerAssets.get(ownerKey(owner)) !== owner.assetId) {
      ownerMetadataMismatches.set(`${ownerKey(owner)}\u0000${owner.assetId}`, owner);
    }
  }
  for (const expected of snapshot.expectedOwners) {
    const actual = actualOwnersByKey.get(ownerKey(expected));
    if (actual?.assetId !== expected.assetId) {
      ownerMetadataMismatches.set(`${ownerKey(expected)}\u0000${expected.assetId}`, expected);
    }
  }
  const protectedIds = new Set([
    ...snapshot.owners.map((owner) => owner.assetId),
    ...snapshot.expectedOwners.map((owner) => owner.assetId),
    ...snapshot.protectedRollbackAssetIds,
    ...writingIds,
    ...readyJournals.flatMap((journal) => journal.assetRefs.map((ref) => ref.assetId)),
  ]);
  return {
    authorityValid: snapshot.authorityValid,
    embeddedBinaryMetadata: snapshot.embeddedBinaryMetadata,
    objectsWithoutAuthority: objectIds.filter(
      (assetId) =>
        snapshot.authorityValid &&
        !refsById.has(assetId) &&
        !protectedIds.has(assetId) &&
        !readyJournals.some((journal) => readyJournalClaimsAsset(journal, assetId))
    ),
    ownersWithoutRefs: snapshot.owners.filter((owner) => !refsById.has(owner.assetId)),
    ownerMetadataMismatches: [...ownerMetadataMismatches.values()],
    orphanedJournals: readyJournals
      .filter(
        (journal) =>
          journal.operationId !== undefined && !snapshot.operationIds.has(journal.operationId)
      )
      .map((journal) => journal.journalId),
    refsWithoutObjects: snapshot.refs.filter((ref) => !objectIdSet.has(ref.assetId)),
    refsWithoutOwners: snapshot.refs.filter((ref) => !ownedAssetIds.has(ref.assetId)),
    unfinishedRestoreSessions: snapshot.archiveSessions.filter(
      (session) => session.status === 'pending'
    ),
  };
}

export async function collectOrphanAssetObjects(): Promise<DurableAssetAuditReport> {
  return runWithDurableAssetLifecycleLock(collectOrphanAssetObjectsUnderLock);
}

async function collectOrphanAssetObjectsUnderLock(): Promise<DurableAssetAuditReport> {
  const report = await auditDurableAssets();
  if (!report.authorityValid) return report;
  for (const assetId of report.objectsWithoutAuthority) {
    await runWithAssetObjectLockIfAvailable(assetId, async () => {
      if (await isStillOrphanAssetObject(assetId)) await deleteAssetObject(assetId);
    });
  }
  return report;
}

async function isStillOrphanAssetObject(assetId: string): Promise<boolean> {
  const snapshot = await collectDurableAssetSnapshot();
  if (
    !snapshot.authorityValid ||
    snapshot.refs.some((ref) => ref.assetId === assetId) ||
    snapshot.owners.some((owner) => owner.assetId === assetId) ||
    snapshot.expectedOwners.some((owner) => owner.assetId === assetId) ||
    snapshot.protectedRollbackAssetIds.has(assetId)
  )
    return false;
  const [readyJournals, writingIds] = await Promise.all([
    listReadyJournals(),
    listWritingAssetIds(),
  ]);
  return (
    !writingIds.includes(assetId) &&
    !readyJournals.some((journal) => readyJournalClaimsAsset(journal, assetId))
  );
}

function ownerKey(owner: AssetOwner): string {
  return `${owner.ownerKind}\u0000${owner.ownerId}\u0000${owner.role}`;
}

/** Candidate discovery is advisory; each deletion revalidates authority under the lifecycle lock. */
export async function collectOrphanAssetObjectsDuringIdle(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await initDB();
  const report = await auditDurableAssets();
  if (!report.authorityValid || signal.aborted) return;
  // One finite pass per Gallery refresh. The next refresh can retry busy or remaining candidates.
  for (const assetId of report.objectsWithoutAuthority.slice(0, 32)) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (signal.aborted) return;
    await tryRunWithDurableAssetLifecycleLock(async (permit) => {
      if (signal.aborted) return;
      await runWithAssetObjectLockIfAvailable(assetId, async () => {
        if (signal.aborted || !(await isStillOrphanAssetObject(assetId))) return;
        if (signal.aborted) return;
        const operation = buildPhysicalDeleteOperation([assetId]);
        await runWithIndexedDbMutation((db) => db.put(ASSET_OPERATIONS_STORE, operation));
        // Once durable intent commits, finish its physical step or leave the intent for replay.
        await completePhysicalDeleteOperation(operation, permit);
      });
    });
  }
}
