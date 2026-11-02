import type { IDBPTransaction } from 'idb';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  SYNC_CAPTURE_STORE,
} from '../infrastructure/indexed-db/core.stores';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  readAssetResidencyCopyInTransaction,
  rebaseInlineImagePresentationInTransaction,
} from '../assets/residency';
import { assetResidencyCopyId, type AssetResidencyCopy } from '../assets/residency-records';
import { readEnabledCaptureProfile } from './capture';
import { captureRootKey, type SyncCaptureProfile, type SyncCaptureRootState } from './contracts';
import { readCaptureRootState } from './guards';
import {
  digestCapturedImageRows,
  digestUnloadedImageReplicaRows,
  readImageReplicaPredecessorInTransaction,
} from './image-snapshot';
import { digestCapturedScenarioRows, freezeScenarioInTransaction } from './scenario-snapshot';

type Transaction = IDBPTransaction<unknown, string[], 'readwrite'>;

async function baseline(
  tx: Transaction,
  entry: AggregatePresentationEntry,
  rootKind: 'media' | 'scenario-project'
): Promise<{ profile: SyncCaptureProfile; state: SyncCaptureRootState } | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const rootKey = captureRootKey(profile.spaceId, rootKind, entry.aggregateId);
  const state = await readCaptureRootState(tx, rootKey, () => {
    throw new Error('Invalid presentation checkpoint predecessor.');
  });
  if (
    !state ||
    state.deleted ||
    state.rootKind !== rootKind ||
    state.rootId !== entry.aggregateId ||
    state.spaceId !== profile.spaceId ||
    state.nativeRevision !== entry.presentationRevision ||
    !state.nativeDigest
  )
    return null;
  return { profile, state };
}

async function writePresentation(
  tx: Transaction,
  entry: AggregatePresentationEntry
): Promise<void> {
  await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).put(entry);
}

function matchesInlineBaseline(
  copy: AssetResidencyCopy,
  accepted: { profile: SyncCaptureProfile; state: SyncCaptureRootState },
  media: {
    id: string;
    createdAt: number;
    workspaceRevision?: number;
    size: number;
    mimeType: string;
    blob?: Blob;
  }
): boolean {
  const { target, remote } = copy;
  const { profile, state } = accepted;
  return (
    target.kind === 'inline-image' &&
    target.mediaId === media.id &&
    target.createdAt === media.createdAt &&
    target.workspaceRevision === media.workspaceRevision &&
    target.size === media.size &&
    target.mimeType === media.mimeType &&
    (media.blob === undefined || target.blobType === media.blob.type) &&
    target.rootGeneration === state.generation &&
    target.nativeDigest === state.nativeDigest &&
    remote.binding.spaceId === profile.spaceId &&
    remote.binding.profileCreatedAt === profile.createdAt &&
    remote.binding.connectionGeneration === profile.connectionGeneration
  );
}

/** Cache rendering cannot mint native work or replace the document writer's pending receipt. */
export async function commitImagePresentationCacheInTransaction(
  tx: Transaction,
  entry: AggregatePresentationEntry,
  permit: PersistenceMutationPermit
): Promise<void> {
  const accepted = await baseline(tx, entry, 'media');
  if (!accepted) return writePresentation(tx, entry);
  const before = await readImageReplicaPredecessorInTransaction(
    tx,
    entry.aggregateId,
    accepted.state
  );
  if (before.digest !== accepted.state.nativeDigest) return writePresentation(tx, entry);
  const copy =
    before.unloadedCopy ??
    (await readAssetResidencyCopyInTransaction(
      tx,
      assetResidencyCopyId({ kind: 'inline-image', mediaId: entry.aggregateId })
    ));
  const after = { ...before.rows, presentation: entry };
  let digest: string;
  if (before.unloadedCopy?.target.kind === 'inline-image') {
    const { duplicatePreview: _duplicatePreview, ...original } = before.unloadedCopy.target;
    digest = digestUnloadedImageReplicaRows(after, original);
  } else {
    digest = digestCapturedImageRows(after);
  }
  await writePresentation(tx, entry);
  if (copy && matchesInlineBaseline(copy, accepted, before.rows.media)) {
    await rebaseInlineImagePresentationInTransaction(tx, copy, digest, permit);
  }
  await tx.objectStore(SYNC_CAPTURE_STORE).put({ ...accepted.state, nativeDigest: digest });
}

/** Rebase only an unchanged accepted Scenario; authored pending rows keep their earlier baseline. */
export async function commitScenarioPresentationCacheInTransaction(
  tx: Transaction,
  entry: AggregatePresentationEntry
): Promise<void> {
  const accepted = await baseline(tx, entry, 'scenario-project');
  if (!accepted) return writePresentation(tx, entry);
  const before = await freezeScenarioInTransaction(tx, entry.aggregateId);
  const clean = digestCapturedScenarioRows(before) === accepted.state.nativeDigest;
  await writePresentation(tx, entry);
  if (clean) {
    await tx.objectStore(SYNC_CAPTURE_STORE).put({
      ...accepted.state,
      nativeDigest: digestCapturedScenarioRows({ ...before, presentation: entry }),
    });
  }
}
