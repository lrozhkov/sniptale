import { freezeVideoReviewInTransaction, digestCapturedVideoReviewRows } from './review-snapshot';
import { collectCapturedProjectEditingMediaIds } from './project-snapshot';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { freezeImageInTransaction, digestCapturedImageRows } from './image-snapshot';
import type { IDBPTransaction } from 'idb';
import {
  MEDIA_LIBRARY_STORE,
  SYNC_CAPTURE_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  captureRootKey,
  SYNC_CAPTURE_PROFILE_KEY,
  type CaptureOrigin,
  type CaptureRootKind,
  type CapturedChange,
  type CaptureOperation,
  type SyncCaptureProfile,
  type SyncCaptureRootState,
  type CapturedVideoProjectRows,
  type CapturedMediaDependency,
} from './contracts';
import { fingerprintNativeCapture, parseSyncCaptureRecord } from './guards';
import {
  freezeVideoProjectInTransaction,
  freezeMediaInTransaction,
  digestCapturedMediaRows,
  UnsupportedSyncCaptureGraphError,
} from './freeze';

type CaptureTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;

/** Read the explicit profile in the domain transaction, before graph capture. */
export async function readEnabledCaptureProfile(
  tx: CaptureTransaction
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
  options: { origin?: CaptureOrigin; publicationId?: string } = {}
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
  if (project?.lifecycle?.storageClass === 'temporary') return null;
  const rows = await freezeVideoProjectInTransaction(tx, projectId);
  rows.mediaDependencies = await captureMediaDependencies(tx, profile, rows);
  return appendCapture(
    tx,
    profile,
    'video-project',
    projectId,
    { kind: 'video-project', rows },
    options
  );
}

/** Capture the native Library publication before the caller commits its source transaction. */
export async function captureMediaInTransaction(
  tx: CaptureTransaction,
  mediaId: string,
  options: { origin?: CaptureOrigin; publicationId?: string } = {}
): Promise<CaptureOperation | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const replay = await readPublicationReplay(tx, profile, 'media', mediaId, options.publicationId);
  if (replay) return replay;
  const source = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
  if (source?.lifecycle?.storageClass === 'temporary') return null;
  if (source?.source.kind === 'screenshot') return captureImageInTransaction(tx, mediaId, options);
  const rows = await freezeMediaInTransaction(tx, mediaId, { allowIndependentReview: true });
  return appendCapture(tx, profile, 'media', mediaId, { kind: 'media', rows }, options);
}

/** Capture a review and its source heads in the native writer's transaction. */
export async function captureVideoReviewInTransaction(
  tx: CaptureTransaction,
  aggregateId: string,
  options: { origin?: CaptureOrigin; publicationId?: string } = {}
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
  const mediaDependencies: CapturedMediaDependency[] = [];
  for (const id of new Set([rows.source.media.id, ...rows.media.map((entry) => entry.id)]))
    mediaDependencies.push(await captureReviewMediaDependency(tx, profile, id, options.origin));
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
  const key = JSON.stringify(['root-state', rootKey]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
  if (raw === undefined) return null;
  const state = parseSyncCaptureRecord(raw);
  if (
    !state ||
    state.kind !== 'root-state' ||
    state.key !== key ||
    state.rootKey !== rootKey ||
    state.nativeRevision === undefined
  )
    throw new Error('Invalid video review revision fence.');
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
  origin: CaptureOrigin = 'local-edit'
): Promise<CapturedMediaDependency> {
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
  options: { origin?: CaptureOrigin; publicationId?: string } = {}
): Promise<CaptureOperation | null> {
  const profile = await readEnabledCaptureProfile(tx);
  if (!profile) return null;
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
  if (media?.lifecycle?.storageClass === 'temporary') return null;
  const rows = await freezeImageInTransaction(tx, mediaId);
  const replay = await readPublicationReplay(tx, profile, 'media', mediaId, options.publicationId);
  if (replay) return replay;
  return appendCapture(tx, profile, 'media', mediaId, { kind: 'image', rows }, options);
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
  const raw: unknown = await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .get(JSON.stringify(['root-state', rootKey]));
  if (raw === undefined) return null;
  const state = parseSyncCaptureRecord(raw);
  if (
    !state ||
    state.kind !== 'root-state' ||
    state.rootKey !== rootKey ||
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
  rows: CapturedVideoProjectRows
): Promise<CapturedMediaDependency[]> {
  const dependencies: CapturedMediaDependency[] = [];
  const editingMedia = collectCapturedProjectEditingMediaIds(rows);
  for (const media of rows.media) {
    if (media.source.kind === 'project-export') {
      if (editingMedia.has(media.id)) throw new UnsupportedSyncCaptureGraphError();
      continue;
    }
    if (editingMedia.has(media.id))
      dependencies.push(await captureMediaDependency(tx, profile, media.id));
  }
  return dependencies;
}

/** Capture an absent dependency in this transaction. Existing heads must match the native snapshot. */
async function captureMediaDependency(
  tx: CaptureTransaction,
  profile: SyncCaptureProfile,
  mediaId: string
): Promise<CapturedMediaDependency> {
  const rootKey = captureRootKey(profile.spaceId, 'media', mediaId);
  const raw: unknown = await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .get(JSON.stringify(['root-state', rootKey]));
  const frozen = await freezeMediaInTransaction(tx, mediaId);
  if (raw === undefined) {
    const captured = await appendCapture(
      tx,
      profile,
      'media',
      mediaId,
      { kind: 'media', rows: frozen },
      {}
    );
    return { mediaId, generation: captured.generation, basis: [captured.operationId] };
  }
  const state = parseSyncCaptureRecord(raw);
  if (
    !state ||
    state.kind !== 'root-state' ||
    state.rootKey !== rootKey ||
    state.basis.length === 0 ||
    state.nativeDigest !== digestCapturedMediaRows(frozen)
  )
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
  options: { origin?: CaptureOrigin; publicationId?: string; nativeRevision?: number }
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
          nativeDigest: digestCapturedImageRows(change.rows),
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
  await store.add(record);
  await store.put(state);
  return record;
}
