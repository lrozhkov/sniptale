import type { IDBPTransaction } from 'idb';
import { SYNC_CAPTURE_STORE } from '../infrastructure/indexed-db/core.stores';
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
  const rows = await freezeMediaInTransaction(tx, mediaId);
  return appendCapture(tx, profile, 'media', mediaId, { kind: 'media', rows }, options);
}

/** Native metadata must still match the independent revision that supplied its causal head. */
async function captureMediaDependencies(
  tx: CaptureTransaction,
  profile: SyncCaptureProfile,
  rows: CapturedVideoProjectRows
): Promise<CapturedMediaDependency[]> {
  const dependencies: CapturedMediaDependency[] = [];
  const editingMedia = collectEditingMediaIds(rows);
  for (const media of rows.media) {
    if (media.source.kind === 'project-export') {
      if (editingMedia.has(media.id)) throw new UnsupportedSyncCaptureGraphError();
      continue;
    }
    dependencies.push(await captureMediaDependency(tx, profile, media.id));
  }
  return dependencies;
}

/** Independent export mirrors are outside the editing dependency set. */
function collectEditingMediaIds(rows: CapturedVideoProjectRows): Set<string> {
  const mediaIds = new Set<string>();
  for (const asset of rows.project.project.assets) {
    if (asset.source.kind === 'library-asset') mediaIds.add(asset.source.mediaId);
    if (asset.source.kind === 'project-asset' && asset.source.originMediaId)
      mediaIds.add(asset.source.originMediaId);
  }
  for (const asset of rows.assets) if (asset.originMediaId) mediaIds.add(asset.originMediaId);
  return mediaIds;
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
  origin: CaptureOrigin = 'local-edit'
): Promise<CaptureOperation | null> {
  const profile = await readEnabledCaptureProfile(tx);
  return profile
    ? appendCapture(tx, profile, rootKind, rootId, { kind: 'tombstone' }, { origin })
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
  options: { origin?: CaptureOrigin; publicationId?: string }
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
        (change.kind === 'media'
          ? change.rows.media.filename
          : change.kind === 'video-project'
            ? change.rows.project.project.name
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
  };
  await store.add(record);
  await store.put(state);
  return record;
}
