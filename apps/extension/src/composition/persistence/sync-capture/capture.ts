import type { IDBPTransaction } from 'idb';
import { SYNC_CAPTURE_STORE } from '../infrastructure/indexed-db/core.stores';
import {
  captureRootKey,
  MAX_PENDING_CAPTURES,
  SYNC_CAPTURE_PROFILE_KEY,
  type CaptureOrigin,
  type CaptureRootKind,
  type CapturedChange,
  type SyncCaptureProfile,
  type SyncCaptureRootState,
} from './contracts';
import { parseSyncCaptureRecord } from './guards';
import { freezeVideoProjectInTransaction } from './freeze';

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
): Promise<CapturedChange | null> {
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
  return appendCapture(
    tx,
    profile,
    'video-project',
    projectId,
    { kind: 'video-project', rows },
    options
  );
}

/** A tombstone preserves identity and predecessors after the native row is removed. */
export async function captureDeletionInTransaction(
  tx: CaptureTransaction,
  rootKind: CaptureRootKind,
  rootId: string,
  origin: CaptureOrigin = 'local-edit'
): Promise<CapturedChange | null> {
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
): Promise<CapturedChange | null> {
  if (publicationId === undefined) return null;
  const raw: unknown = await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .get(publicationKey(profile.spaceId, rootKind, rootId, publicationId));
  if (raw === undefined) return null;
  const record = parseSyncCaptureRecord(raw);
  if (
    !record ||
    record.kind !== 'captured-change' ||
    record.spaceId !== profile.spaceId ||
    record.rootKind !== rootKind ||
    record.rootId !== rootId ||
    record.publicationId !== publicationId ||
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
  if ((await store.index('kind').count('captured-change')) >= MAX_PENDING_CAPTURES)
    throw new Error('The experimental sync capture queue is full.');
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
  const record: CapturedChange = {
    version: 1,
    kind: 'captured-change',
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
  };
  await store.add(record);
  await store.put(state);
  return record;
}
