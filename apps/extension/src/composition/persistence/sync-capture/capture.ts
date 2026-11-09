import { queueOperationKey, parseSyncQueueOperation } from './queue-model';
import {
  deferCheckpointInTransaction,
  readCheckpointInTransaction,
  consumeCheckpointInTransaction,
} from './checkpoints';
import { readCaptureRootState } from './guards';
import { freezeScenarioInTransaction, digestCapturedScenarioRows } from './scenario-snapshot';
import { freezeVideoReviewInTransaction, digestCapturedVideoReviewRows } from './review-snapshot';
import {
  collectCapturedProjectEditingMediaIds,
  collectCapturedProjectScenarioDependencies,
} from './project-snapshot';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import {
  freezeImageInTransaction,
  isImageCaptureSource,
  digestCapturedImageRows,
} from './image-snapshot';
import type { IDBPTransaction } from 'idb';
import {
  MEDIA_LIBRARY_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  SYNC_CAPTURE_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  captureRootKey,
  pendingCheckpointKey,
  SYNC_CAPTURE_PROFILE_KEY,
  type CaptureOrigin,
  type CaptureRootKind,
  type CapturedChange,
  type CaptureOperation,
  type SyncCaptureProfile,
  type SyncCaptureRootState,
  type SyncPendingCheckpoint,
  type CapturedVideoProjectRows,
  type CapturedMediaDependency,
} from './contracts';
import { fingerprintNativeCapture, parseSyncCaptureRecord } from './guards';
import {
  freezeVideoProjectInTransaction,
  freezeMediaInTransaction,
  readCompatibleImageReplicaPredecessorInTransaction,
  digestCapturedMediaRows,
  UnsupportedSyncCaptureGraphError,
} from './freeze';

type CaptureTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;
type CheckpointMode = 'defer' | 'freeze' | 'lifecycle';
interface CaptureOptions {
  origin?: CaptureOrigin;
  publicationId?: string;
  checkpoint?: CheckpointMode;
}

/** Read the explicit profile in the domain transaction, before graph capture. */
export async function readEnabledCaptureProfile(
  tx: Pick<IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>, 'objectStore'>
): Promise<SyncCaptureProfile | null> {
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(SYNC_CAPTURE_PROFILE_KEY);
  if (raw === undefined) return null;
  const parsed = parseSyncCaptureRecord(raw);
  if (!parsed || parsed.kind !== 'profile') throw new Error('Invalid sync capture profile.');
  return parsed.enabled ? parsed : null;
}

/** Append the accepted after-image before the caller commits its native transaction. */
export async function captureVideoProjectInTransaction(
  tx: CaptureTransaction,
  projectId: string,
  options: CaptureOptions = {}
): Promise<CaptureOperation | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const replay = await readPublicationReplay(
    tx,
    profile,
    'video-project',
    projectId,
    options.publicationId
  );
  if (replay) return replay;
  const project = parseVideoProjectEntry(await tx.objectStore(VIDEO_PROJECTS_STORE).get(projectId));
  if (!project) throw new UnsupportedSyncCaptureGraphError();
  if (project.lifecycle?.storageClass === 'temporary') return null;
  if (
    (options.checkpoint === 'defer' ||
      (options.checkpoint !== 'freeze' &&
        options.checkpoint !== 'lifecycle' &&
        profile.checkpointIntervalMs !== undefined)) &&
    options.origin !== 'local-restore' &&
    !options.publicationId
  ) {
    await deferCheckpointInTransaction(tx, { rootKind: 'video-project', rootId: projectId });
    return null;
  }
  const rows = await freezeVideoProjectInTransaction(tx, projectId);
  rows.mediaDependencies = await captureMediaDependencies(tx, profile, rows, options.checkpoint);
  const rootDependencies = [];
  for (const [rootId, childIds] of collectCapturedProjectScenarioDependencies(rows)) {
    await capturePendingDependency(
      tx,
      profile,
      { rootKind: 'scenario-project', rootId },
      options.checkpoint
    );
    const rootKey = captureRootKey(profile.spaceId, 'scenario-project', rootId);
    let state = parseSyncCaptureRecord(
      await tx.objectStore(SYNC_CAPTURE_STORE).get(JSON.stringify(['root-state', rootKey]))
    );
    const scenario = await freezeScenarioInTransaction(tx, rootId);
    if (!state) {
      await captureScenarioProjectInTransaction(tx, rootId, {
        dependency: true,
        checkpoint: options.checkpoint === 'lifecycle' ? 'lifecycle' : 'freeze',
      });
      state = parseSyncCaptureRecord(
        await tx.objectStore(SYNC_CAPTURE_STORE).get(JSON.stringify(['root-state', rootKey]))
      );
    }
    if (
      !state ||
      state.kind !== 'root-state' ||
      state.deleted ||
      state.basis.length !== 1 ||
      state.nativeDigest !== digestCapturedScenarioRows(scenario)
    )
      throw new UnsupportedSyncCaptureGraphError();
    rootDependencies.push({
      rootKind: 'scenario-project' as const,
      rootId,
      generation: state.generation,
      basis: [...state.basis],
      childIds,
    });
  }
  if (rootDependencies.length) rows.rootDependencies = rootDependencies;
  const checkpointRows =
    (options.checkpoint === 'freeze' || options.checkpoint === 'lifecycle') &&
    rows.presentation &&
    rows.presentation.presentationRevision !== (rows.project.workspaceRevision ?? 0)
      ? { ...rows, presentation: null }
      : rows;
  return appendCapture(
    tx,
    profile,
    'video-project',
    projectId,
    { kind: 'video-project', rows: checkpointRows },
    options
  );
}

/** Capture one accepted Scenario after-image before its native writer commits. */
export async function captureScenarioProjectInTransaction(
  tx: CaptureTransaction,
  projectId: string,
  options: CaptureOptions & { dependency?: boolean } = {}
): Promise<CaptureOperation | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const replay = await readPublicationReplay(
    tx,
    profile,
    'scenario-project',
    projectId,
    options.publicationId
  );
  if (replay) return replay;
  const rows = await freezeScenarioInTransaction(tx, projectId);
  if (
    !options.dependency &&
    (rows.entry.lifecycle?.storageClass === 'temporary' ||
      rows.entry.project.purpose === 'step-template')
  ) {
    const rootKey = captureRootKey(profile.spaceId, 'scenario-project', projectId);
    if (
      (await tx.objectStore(SYNC_CAPTURE_STORE).get(JSON.stringify(['root-state', rootKey]))) ===
      undefined
    )
      return null;
  }
  if (
    (options.checkpoint === 'defer' ||
      (options.checkpoint !== 'freeze' &&
        options.checkpoint !== 'lifecycle' &&
        profile.checkpointIntervalMs !== undefined)) &&
    options.origin !== 'local-restore' &&
    !options.publicationId
  ) {
    await deferCheckpointInTransaction(tx, { rootKind: 'scenario-project', rootId: projectId });
    return null;
  }
  rows.mediaDependencies = [];
  for (const media of rows.media)
    rows.mediaDependencies.push(
      await captureMediaDependency(tx, profile, media.id, options.checkpoint)
    );
  const nativeDigest = digestCapturedScenarioRows(rows);
  const checkpointRows =
    (options.checkpoint === 'freeze' || options.checkpoint === 'lifecycle') &&
    rows.presentation &&
    rows.presentation.presentationRevision !== rows.entry.workspaceRevision
      ? { ...rows, presentation: null }
      : rows;
  // Preserve the full native predecessor while omitting an obsolete portable presentation.
  return appendCapture(
    tx,
    profile,
    'scenario-project',
    projectId,
    { kind: 'scenario-project', rows: checkpointRows },
    { ...options, nativeDigest }
  );
}

/** Preserve the enrolled Scenario clock across deletion and recreation of one identity. */
export async function readScenarioRevisionFence(
  tx: CaptureTransaction,
  projectId: string
): Promise<number | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const rootKey = captureRootKey(profile.spaceId, 'scenario-project', projectId);
  const state = await readCaptureRootState(
    tx,
    rootKey,
    () => {
      throw new Error('Scenario revision fence is unavailable.');
    },
    false
  );
  if (!state) return null;
  if (state.nativeRevision === undefined)
    throw new Error('Scenario revision fence is unavailable.');
  return state.nativeRevision;
}

/** Capture the native Library publication before the caller commits its source transaction. */
export async function captureMediaInTransaction(
  tx: CaptureTransaction,
  mediaId: string,
  options: CaptureOptions = {}
): Promise<CaptureOperation | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const replay = await readPublicationReplay(tx, profile, 'media', mediaId, options.publicationId);
  if (replay) return replay;
  const source = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
  if (source?.lifecycle?.storageClass === 'temporary') return null;
  const originalOnlyProjectImage =
    source &&
    isImageCaptureSource(source) &&
    source.source.kind === 'project-asset' &&
    source.workspaceRevision === 0 &&
    source.imageContentState !== 'edited' &&
    (await tx.objectStore(IMAGE_WORKSPACES_STORE).get(mediaId)) === undefined &&
    (await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).get(['image', mediaId])) === undefined;
  if (source && isImageCaptureSource(source) && !originalOnlyProjectImage) {
    const state = await readCaptureRootState(
      tx,
      captureRootKey(profile.spaceId, 'media', mediaId),
      () => {
        throw new UnsupportedSyncCaptureGraphError();
      }
    );
    // Source publication needs an initial causal identity. Later metadata follows the device period.
    const checkpoint = options.checkpoint ?? (state ? undefined : 'freeze');
    return captureImageInTransaction(tx, mediaId, {
      ...options,
      ...(checkpoint === undefined ? {} : { checkpoint }),
    });
  }
  const rows = await freezeMediaInTransaction(tx, mediaId, { allowIndependentReview: true });
  return appendCapture(tx, profile, 'media', mediaId, { kind: 'media', rows }, options);
}

/** Capture a review and its source heads in the native writer's transaction. */
export async function captureVideoReviewInTransaction(
  tx: CaptureTransaction,
  aggregateId: string,
  options: CaptureOptions = {}
): Promise<CaptureOperation | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const replay = await readPublicationReplay(
    tx,
    profile,
    'video-review',
    aggregateId,
    options.publicationId
  );
  if (replay) return replay;
  const rows = await freezeVideoReviewInTransaction(tx, aggregateId);
  const state = await readVideoReviewState(tx, profile, aggregateId);
  if (state?.deleted !== true && state?.nativeDigest === digestCapturedVideoReviewRows(rows))
    return null;
  if (
    (options.checkpoint === 'defer' ||
      (options.checkpoint !== 'freeze' &&
        options.checkpoint !== 'lifecycle' &&
        profile.checkpointIntervalMs !== undefined)) &&
    options.origin !== 'local-restore' &&
    !options.publicationId
  ) {
    await deferCheckpointInTransaction(tx, { rootKind: 'video-review', rootId: aggregateId });
    return null;
  }
  const mediaDependencies: CapturedMediaDependency[] = [];
  for (const id of new Set([rows.source.media.id, ...rows.media.map((entry) => entry.id)]))
    mediaDependencies.push(
      await captureReviewMediaDependency(tx, profile, id, options.origin, options.checkpoint)
    );
  return appendCapture(
    tx,
    profile,
    'video-review',
    aggregateId,
    { kind: 'video-review', rows, mediaDependencies },
    options
  );
}

async function readVideoReviewState(
  tx: CaptureTransaction,
  profile: SyncCaptureProfile,
  id: string
): Promise<SyncCaptureRootState | null> {
  const rootKey = captureRootKey(profile.spaceId, 'video-review', id);
  const state = await readCaptureRootState(tx, rootKey, () => {
    throw new Error('Invalid video review revision fence.');
  });
  if (!state) return null;
  if (state.nativeRevision === undefined) throw new Error('Invalid video review revision fence.');
  return state;
}

/** Preserve native ordering when opening or restoring the same review identity. */
export async function allocateVideoReviewRevision(
  tx: CaptureTransaction,
  id: string,
  minimumRevision: number
): Promise<number> {
  if (!Number.isSafeInteger(minimumRevision) || minimumRevision < 1)
    throw new Error('Invalid video review revision.');
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return minimumRevision;
  const state = await readVideoReviewState(tx, profile, id);
  const revision = Math.max(minimumRevision, (state?.nativeRevision ?? 0) + 1);
  if (!Number.isSafeInteger(revision)) throw new Error('Video review revision limit reached.');
  return revision;
}

/** A purged New command cannot recreate its archive and reset newer work. */
export async function assertUnusedVideoReviewIdentity(
  tx: CaptureTransaction,
  id: string
): Promise<void> {
  const profile = await readEnabledCaptureProfile(tx);
  if (profile && (await readVideoReviewState(tx, profile, id)))
    throw new Error('Video review identity has already been used.');
}

async function captureReviewMediaDependency(
  tx: CaptureTransaction,
  profile: SyncCaptureProfile,
  mediaId: string,
  origin: CaptureOrigin = 'local-edit',
  checkpoint?: CheckpointMode
): Promise<CapturedMediaDependency> {
  await capturePendingDependency(tx, profile, { rootKind: 'media', rootId: mediaId }, checkpoint);
  const rows = await freezeMediaInTransaction(tx, mediaId, { allowIndependentReview: true });
  const rootKey = captureRootKey(profile.spaceId, 'media', mediaId);
  const key = JSON.stringify(['root-state', rootKey]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
  const state = raw === undefined ? null : parseSyncCaptureRecord(raw);
  if (
    raw !== undefined &&
    (!state || state.kind !== 'root-state' || state.key !== key || state.rootKey !== rootKey)
  )
    throw new Error('Invalid review source head.');
  if (state && state.kind !== 'root-state') throw new Error('Invalid review source head.');
  if (!state || state.deleted === true || state.nativeDigest !== digestCapturedMediaRows(rows)) {
    const operation = await appendCapture(
      tx,
      profile,
      'media',
      mediaId,
      { kind: 'media', rows },
      { origin }
    );
    return { mediaId, generation: operation.generation, basis: [operation.operationId] };
  }
  return { mediaId, generation: state.generation, basis: [...state.basis] };
}

/** Capture each saved screenshot mutation through its native writer transaction. */
export async function captureImageInTransaction(
  tx: CaptureTransaction,
  mediaId: string,
  options: CaptureOptions = {}
): Promise<CaptureOperation | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
  if (!media) throw new Error('Unsupported screenshot aggregate snapshot.');
  if (media.lifecycle?.storageClass === 'temporary') return null;
  const replay = await readPublicationReplay(tx, profile, 'media', mediaId, options.publicationId);
  if (replay) return replay;
  if (
    (options.checkpoint === 'defer' ||
      (options.checkpoint !== 'freeze' &&
        options.checkpoint !== 'lifecycle' &&
        profile.checkpointIntervalMs !== undefined)) &&
    options.origin !== 'local-restore'
  ) {
    await deferCheckpointInTransaction(tx, { rootKind: 'media', rootId: mediaId });
    return null;
  }
  const rows = await freezeImageInTransaction(tx, mediaId);
  const nativeDigest = digestCapturedImageRows(rows);
  const checkpointRows =
    (options.checkpoint === 'freeze' || options.checkpoint === 'lifecycle') &&
    rows.presentation &&
    rows.presentation.presentationRevision !== (rows.media.workspaceRevision ?? 0)
      ? { ...rows, presentation: null }
      : rows;
  // Native admission includes the retained render; the checkpoint omits an obsolete preview.
  return appendCapture(
    tx,
    profile,
    'media',
    mediaId,
    { kind: 'image', rows: checkpointRows },
    { ...options, nativeDigest }
  );
}

/** Tentative native branch result. The caller must confirm transaction completion before reporting it. */
export type SyncCheckpointCaptureOutcome =
  | 'deadline-waiting'
  | 'admission-refused'
  | 'revision-changed'
  | 'predecessor-waiting'
  | 'acknowledged';

/**
 * Freeze one due native root and consume its exact pending revision in the same transaction.
 * The caller owns the complete native store scope and must abort on failure.
 */
export async function captureRootCheckpointInTransaction(
  tx: CaptureTransaction,
  expectedInput: SyncPendingCheckpoint,
  options: {
    now?: number;
    force?: true;
    checkpoint?: 'lifecycle';
    onOutcome?: (outcome: SyncCheckpointCaptureOutcome) => void;
  } = {}
): Promise<CaptureOperation | null> {
  const report = (outcome: SyncCheckpointCaptureOutcome) => {
    try {
      options.onOutcome?.(outcome);
    } catch {
      /* A synchronous advisory observer cannot change native capture or transaction admission. */
    }
  };
  const expected = parseSyncCaptureRecord(structuredClone(expectedInput));
  if (!expected || expected.kind !== 'pending-checkpoint')
    throw new Error('Invalid pending sync checkpoint selection.');
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid checkpoint time.');
  if (!options.force && expected.dueAt > now) {
    report('deadline-waiting');
    return null;
  }
  const profile = await readEnabledCaptureProfile(tx);
  if (
    !profile ||
    profile.spaceId !== expected.spaceId ||
    profile.createdAt !== expected.profileCreatedAt ||
    profile.connectionGeneration !== expected.connectionGeneration
  ) {
    report('admission-refused');
    return null;
  }
  const pending = await readCheckpointInTransaction(tx, expected, expected);
  if (!pending || pending.revision !== expected.revision) {
    report('revision-changed');
    return null;
  }
  if (options.checkpoint !== 'lifecycle' && !(await checkpointPredecessorPublished(tx, expected))) {
    report('predecessor-waiting');
    return null;
  }
  if (!(await consumeCheckpointInTransaction(tx, expected))) {
    report('revision-changed');
    return null;
  }
  const checkpoint = options.checkpoint ?? 'freeze';
  const captured =
    expected.rootKind === 'media'
      ? await captureMediaInTransaction(tx, expected.rootId, { checkpoint })
      : expected.rootKind === 'video-project'
        ? await captureVideoProjectInTransaction(tx, expected.rootId, { checkpoint })
        : expected.rootKind === 'video-review'
          ? await captureVideoReviewInTransaction(tx, expected.rootId, { checkpoint })
          : await captureScenarioProjectInTransaction(tx, expected.rootId, {
              checkpoint,
            });
  // An unchanged review has no new snapshot. The consumed native work is already represented.
  report('acknowledged');
  return captured;
}

async function checkpointPredecessorPublished(
  tx: CaptureTransaction,
  pending: SyncPendingCheckpoint
): Promise<boolean> {
  const store = tx.objectStore(SYNC_CAPTURE_STORE);
  const raw: unknown = await store.get(JSON.stringify(['root-state', pending.rootKey]));
  if (raw === undefined) return true;
  const state = parseSyncCaptureRecord(raw);
  if (!state || state.kind !== 'root-state' || state.rootKey !== pending.rootKey)
    throw new Error('Invalid checkpoint predecessor.');
  for (const operationId of state.basis) {
    const receipt = parseSyncCaptureRecord(
      await store.get(JSON.stringify(['applied-operation', pending.spaceId, operationId]))
    );
    if (
      receipt?.kind === 'applied-operation' &&
      receipt.rootKey === pending.rootKey &&
      receipt.operationId === operationId
    )
      continue;
    const direct = parseSyncCaptureRecord(await store.get(JSON.stringify(['change', operationId])));
    if (
      direct?.kind === 'sync-operation' &&
      direct.rootKey === pending.rootKey &&
      direct.operationId === operationId
    ) {
      if (direct.phase !== 'published') return false;
      continue;
    }
    // Publication-keyed legacy captures must first pass the existing queue discovery owner.
    const scope = {
      spaceId: pending.spaceId,
      profileCreatedAt: pending.profileCreatedAt,
      connectionGeneration: pending.connectionGeneration,
    };
    const queued = parseSyncQueueOperation(
      await tx.objectStore('sync_outbox').get(queueOperationKey(scope, operationId))
    );
    if (
      !queued ||
      queued.operationId !== operationId ||
      queued.rootKey !== pending.rootKey ||
      queued.status !== 'published'
    )
      return false;
    const capture = parseSyncCaptureRecord(await store.get(queued.captureKey));
    if (
      !capture ||
      capture.kind !== 'sync-operation' ||
      capture.operationId !== operationId ||
      capture.rootKey !== pending.rootKey ||
      capture.phase !== 'published'
    )
      return false;
  }
  return true;
}

/** Retain the enrolled image clock when a deleted identity is recreated. */
export async function readImageRevisionFence(
  tx: CaptureTransaction,
  mediaId: string,
  allowLivePredecessor = false
): Promise<number | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const rootKey = captureRootKey(profile.spaceId, 'media', mediaId);
  const state = await readCaptureRootState(
    tx,
    rootKey,
    () => {
      throw new Error('Image identity has no safe native revision fence.');
    },
    false
  );
  if (!state) return null;
  if (
    (state.deleted !== true && !allowLivePredecessor) ||
    (state.deleted === true && state.nativeRevision === undefined)
  )
    throw new Error('Image identity has no safe native revision fence.');
  return state.nativeRevision ?? null;
}

/** Allocate the local image clock for restore without importing transport policy. */
export async function allocateRestoredImageRevision(
  tx: CaptureTransaction,
  mediaId: string,
  currentRevision: number
): Promise<number | null> {
  if (!(await readEnabledCaptureProfile(tx))) return null;
  const fence = await readImageRevisionFence(tx, mediaId, true);
  const revision = Math.max(currentRevision, fence ?? 0) + 1;
  if (!Number.isSafeInteger(revision)) throw new Error('Restored image revision exhausted.');
  return revision;
}

/** Native metadata must still match the independent revision that supplied its causal head. */
async function captureMediaDependencies(
  tx: CaptureTransaction,
  profile: SyncCaptureProfile,
  rows: CapturedVideoProjectRows,
  checkpoint?: CheckpointMode
): Promise<CapturedMediaDependency[]> {
  const dependencies: CapturedMediaDependency[] = [];
  const editingMedia = collectCapturedProjectEditingMediaIds(rows);
  for (const media of rows.media) {
    if (media.source.kind === 'project-export' && !editingMedia.has(media.id)) continue;
    if (editingMedia.has(media.id))
      dependencies.push(await captureMediaDependency(tx, profile, media.id, checkpoint));
  }
  return dependencies;
}

/** A parent binds current dependency work only after its exact pending revision becomes immutable. */
async function capturePendingDependency(
  tx: CaptureTransaction,
  profile: SyncCaptureProfile,
  root: { rootKind: 'media' | 'scenario-project'; rootId: string },
  checkpoint?: CheckpointMode
): Promise<void> {
  const scope = {
    spaceId: profile.spaceId,
    profileCreatedAt: profile.createdAt,
    connectionGeneration: profile.connectionGeneration,
  };
  const pending = await readCheckpointInTransaction(tx, scope, root);
  if (!pending) return;
  await captureRootCheckpointInTransaction(tx, pending, {
    force: true,
    ...(checkpoint === 'lifecycle' ? { checkpoint } : {}),
  });
  // An unpublished predecessor must not supply a stale basis for the parent snapshot.
  if (await readCheckpointInTransaction(tx, scope, root))
    throw new UnsupportedSyncCaptureGraphError();
}

/** Capture an absent dependency in this transaction. Existing heads must match the native snapshot. */
async function captureMediaDependency(
  tx: CaptureTransaction,
  profile: SyncCaptureProfile,
  mediaId: string,
  checkpoint?: CheckpointMode
): Promise<CapturedMediaDependency> {
  await capturePendingDependency(tx, profile, { rootKind: 'media', rootId: mediaId }, checkpoint);
  const rootKey = captureRootKey(profile.spaceId, 'media', mediaId);
  const raw: unknown = await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .get(JSON.stringify(['root-state', rootKey]));
  const state = raw === undefined ? null : parseSyncCaptureRecord(raw);
  if (
    raw !== undefined &&
    (!state ||
      state.kind !== 'root-state' ||
      state.rootKey !== rootKey ||
      state.spaceId !== profile.spaceId ||
      state.rootKind !== 'media' ||
      state.rootId !== mediaId ||
      state.deleted ||
      state.basis.length === 0)
  )
    throw new UnsupportedSyncCaptureGraphError();
  const entry = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
  const isImage = entry !== null && isImageCaptureSource(entry);
  if (isImage && state?.kind === 'root-state') {
    // An unchanged dependency needs its causal head, not another snapshot of unloaded bytes.
    const predecessor = await readCompatibleImageReplicaPredecessorInTransaction(
      tx,
      mediaId,
      state
    );
    if (predecessor.digest !== state.nativeDigest) throw new UnsupportedSyncCaptureGraphError();
    return { mediaId, generation: state.generation, basis: [...state.basis] };
  }
  const change: Extract<CapturedChange['change'], { kind: 'image' | 'media' }> = isImage
    ? { kind: 'image', rows: await freezeImageInTransaction(tx, mediaId) }
    : {
        kind: 'media',
        rows: await freezeMediaInTransaction(tx, mediaId, { allowIndependentReview: true }),
      };
  const nativeDigest =
    change.kind === 'image'
      ? digestCapturedImageRows(change.rows)
      : digestCapturedMediaRows(change.rows);
  if (raw === undefined) {
    const captured = await appendCapture(tx, profile, 'media', mediaId, change, {});
    return { mediaId, generation: captured.generation, basis: [captured.operationId] };
  }
  if (!state || state.kind !== 'root-state' || state.nativeDigest !== nativeDigest)
    throw new UnsupportedSyncCaptureGraphError();
  return { mediaId, generation: state.generation, basis: [...state.basis] };
}

/** A tombstone preserves identity and predecessors after the native row is removed. */
export async function captureDeletionInTransaction(
  tx: CaptureTransaction,
  rootKind: CaptureRootKind,
  rootId: string,
  origin: CaptureOrigin = 'local-edit',
  nativeRevision?: number
): Promise<CaptureOperation | null> {
  const profile = await readEnabledCaptureProfile(tx);
  return profile
    ? appendCapture(
        tx,
        profile,
        rootKind,
        rootId,
        { kind: 'tombstone' },
        { origin, ...(nativeRevision === undefined ? {} : { nativeRevision }) }
      )
    : null;
}

async function readPublicationReplay(
  tx: CaptureTransaction,
  profile: SyncCaptureProfile,
  rootKind: CaptureRootKind,
  rootId: string,
  publicationId?: string
): Promise<CaptureOperation | null> {
  if (publicationId === undefined) return null;
  const raw: unknown = await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .get(publicationKey(profile.spaceId, rootKind, rootId, publicationId));
  if (raw === undefined) return null;
  const record = parseSyncCaptureRecord(raw);
  if (
    !record ||
    record.kind !== 'sync-operation' ||
    record.spaceId !== profile.spaceId ||
    record.rootKind !== rootKind ||
    record.rootId !== rootId ||
    record.publicationId !== publicationId ||
    record.profileCreatedAt !== profile.createdAt ||
    record.connectionGeneration !== profile.connectionGeneration
  )
    throw new Error('Invalid sync capture publication receipt.');
  return record;
}

function publicationKey(
  spaceId: string,
  kind: CaptureRootKind,
  rootId: string,
  publicationId: string
): string {
  return JSON.stringify(['publication', spaceId, kind, rootId, publicationId]);
}

async function appendCapture(
  tx: CaptureTransaction,
  profile: SyncCaptureProfile,
  rootKind: CaptureRootKind,
  rootId: string,
  change: CapturedChange['change'],
  options: {
    origin?: CaptureOrigin;
    publicationId?: string;
    nativeRevision?: number;
    nativeDigest?: string;
  }
): Promise<CapturedChange> {
  const store = tx.objectStore(SYNC_CAPTURE_STORE);
  const rootKey = captureRootKey(profile.spaceId, rootKind, rootId);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  const previousRaw: unknown = await store.get(stateKey);
  const previous = previousRaw === undefined ? null : parseSyncCaptureRecord(previousRaw);
  if (
    previousRaw !== undefined &&
    (!previous || previous.kind !== 'root-state' || previous.rootKey !== rootKey)
  )
    throw new Error('Invalid sync capture root state.');
  if (previous && previous.kind !== 'root-state')
    throw new Error('Invalid sync capture root state.');
  const generation = (previous?.generation ?? 0) + 1;
  const operationId = crypto.randomUUID();
  const createdAt = Date.now();
  const input: Omit<CapturedChange, 'sourceSha256'> = {
    version: 1,
    kind: 'sync-operation',
    phase: 'native',
    profileCreatedAt: profile.createdAt,
    source: {
      changeKind: change.kind,
      label:
        (change.kind === 'media' || change.kind === 'image'
          ? change.rows.media.filename
          : change.kind === 'video-project'
            ? change.rows.project.project.name
            : change.kind === 'scenario-project'
              ? change.rows.entry.project.name
              : change.kind === 'video-review'
                ? (change.rows.review.workspace.project?.name ?? rootId)
                : rootId
        ).trim() || rootId,
    },
    key:
      options.publicationId === undefined
        ? JSON.stringify(['change', operationId])
        : publicationKey(profile.spaceId, rootKind, rootId, options.publicationId),
    createdAt,
    spaceId: profile.spaceId,
    connectionGeneration: profile.connectionGeneration,
    rootKind,
    rootId,
    rootKey,
    generation,
    operationId,
    basis: previous?.basis ?? [],
    origin: options.origin ?? 'local-edit',
    publicationId: options.publicationId ?? null,
    change,
  };
  const record: CapturedChange = { ...input, sourceSha256: fingerprintNativeCapture(input) };
  if (!parseSyncCaptureRecord(record)) throw new Error('Invalid accepted sync capture.');
  const state: SyncCaptureRootState = {
    version: 1,
    kind: 'root-state',
    key: stateKey,
    createdAt,
    spaceId: profile.spaceId,
    rootKind,
    rootId,
    rootKey,
    generation,
    basis: [operationId],
    ...(change.kind === 'scenario-project'
      ? {
          nativeDigest: options.nativeDigest ?? digestCapturedScenarioRows(change.rows),
          nativeRevision: Math.max(
            previous?.nativeRevision ?? 0,
            change.rows.entry.workspaceRevision
          ),
        }
      : {}),
    ...(change.kind === 'media' ? { nativeDigest: digestCapturedMediaRows(change.rows) } : {}),
    ...(change.kind === 'video-review'
      ? {
          nativeDigest: digestCapturedVideoReviewRows(change.rows),
          nativeRevision: Math.max(
            previous?.nativeRevision ?? 0,
            change.rows.review.workspace.revision
          ),
        }
      : {}),
    ...(change.kind === 'image'
      ? {
          nativeDigest: options.nativeDigest ?? digestCapturedImageRows(change.rows),
          nativeRevision: Math.max(
            previous?.nativeRevision ?? 0,
            change.rows.media.workspaceRevision ?? 0
          ),
        }
      : {}),
    ...(change.kind === 'tombstone' &&
    (options.nativeRevision !== undefined || previous?.nativeRevision !== undefined)
      ? { nativeRevision: Math.max(options.nativeRevision ?? 0, previous?.nativeRevision ?? 0) }
      : {}),
    ...(change.kind === 'tombstone' ? { deleted: true } : {}),
  };
  await store.delete(pendingCheckpointKey(rootKey));
  await store.add(record);
  await store.put(state);
  return record;
}
