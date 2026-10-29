import type { IDBPTransaction } from 'idb';
import { capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  SYNC_OUTBOX_STORE,
  MEDIA_LIBRARY_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  IMAGE_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  THUMBNAILS_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  parseSyncConnectionIdentity,
  sameSyncConnectionIdentity,
} from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import { captureRootKey, type CaptureRootKind } from './contracts';
import { parseSyncCaptureRecord } from './guards';
import {
  captureMediaInTransaction,
  captureVideoProjectInTransaction,
  captureVideoReviewInTransaction,
  captureScenarioProjectInTransaction,
} from './capture';
import { SCENARIO_CAPTURE_STORES } from './scenario-snapshot';
import { UnsupportedSyncCaptureGraphError } from './freeze';
import { readSyncQueueSourceInTransaction } from './queue';
import {
  parseSyncQueueScope,
  type SyncQueueEnrollmentProgress,
  type SyncQueueScope,
} from './queue-model';
import type { SyncConnectionIdentity } from '../remote-connection/model';
import { SCENARIO_PROJECTS_STORE } from '../infrastructure/indexed-db/core.stores';

const sources = [
  { kind: 'media', store: MEDIA_LIBRARY_STORE },
  { kind: 'video-project', store: VIDEO_PROJECTS_STORE },
  { kind: 'video-review', store: VIDEO_WORKSPACES_STORE },
  { kind: 'scenario-project', store: SCENARIO_PROJECTS_STORE },
] as const;
const captureStores = [
  ...new Set([
    SYNC_CAPTURE_STORE,
    SYNC_CONNECTION_STORE,
    SYNC_OUTBOX_STORE,
    MEDIA_LIBRARY_STORE,
    VIDEO_PROJECTS_STORE,
    VIDEO_WORKSPACES_STORE,
    STORE_NAME,
    RECORDING_TELEMETRY_STORE,
    PROJECT_ASSETS_STORE,
    PROJECT_EXPORTS_STORE,
    ASSET_REFS_STORE,
    ASSET_OWNERS_STORE,
    IMAGE_WORKSPACES_STORE,
    VIDEO_WORKSPACE_HISTORY_STORE,
    VIDEO_WORKSPACE_DRAFTS_STORE,
    THUMBNAILS_STORE,
    AGGREGATE_PRESENTATIONS_STORE,
    WEB_SNAPSHOTS_STORE,
    ...SCENARIO_CAPTURE_STORES,
  ]),
];
type Transaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;

async function admission(
  tx: Transaction,
  scope: SyncQueueScope,
  authorization: SyncConnectionIdentity
) {
  await checkSyncConnectionAdmission(tx, scope, authorization);
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    profile.spaceId !== scope.spaceId ||
    profile.createdAt !== scope.profileCreatedAt ||
    profile.connectionGeneration !== scope.connectionGeneration
  )
    throw new Error('Initial sync enrollment changed.');
  const connection = await readSyncQueueSourceInTransaction(tx, scope, null);
  if (connection.kind !== 'queue-connection' || connection.paused)
    throw new Error('Initial sync enrollment paused.');
  return connection;
}
async function abort(tx: Transaction) {
  try {
    tx.abort();
  } catch {
    /* Transaction can already be closed. */
  }
  await tx.done.catch(() => undefined);
}
async function captureMissingRoot(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  scope: SyncQueueScope,
  rootKind: CaptureRootKind,
  rootId: string
) {
  const rootKey = captureRootKey(scope.spaceId, rootKind, rootId);
  const key = JSON.stringify(['root-state', rootKey]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
  if (raw !== undefined) {
    const state = parseSyncCaptureRecord(raw);
    if (!state || state.kind !== 'root-state' || state.key !== key || state.rootKey !== rootKey)
      throw new Error('Invalid initial sync root state.');
    // Incoming receipts, local writes and tombstones already own this exact space identity.
    return false;
  }
  if (rootKind === 'media') return Boolean(await captureMediaInTransaction(tx, rootId));
  if (rootKind === 'video-project')
    return Boolean(await captureVideoProjectInTransaction(tx, rootId));
  if (rootKind === 'scenario-project')
    return Boolean(await captureScenarioProjectInTransaction(tx, rootId));
  return Boolean(await captureVideoReviewInTransaction(tx, rootId));
}

type EnrollmentResult = {
  captured: number;
  existing: number;
  refused: number;
  remaining: boolean;
  advanced?: true;
};

async function discoverRootPage(
  db: NonNullable<ReturnType<typeof capturePreparedDatabase>>,
  scope: SyncQueueScope,
  authorization: SyncConnectionIdentity
) {
  const discovery = db.transaction(
    [
      SYNC_CAPTURE_STORE,
      SYNC_CONNECTION_STORE,
      SYNC_OUTBOX_STORE,
      ...sources.map((source) => source.store),
    ],
    'readonly'
  );
  let previous: SyncQueueEnrollmentProgress | undefined;
  let keys: IDBValidKey[];
  let source: (typeof sources)[number];
  try {
    const connection = await admission(discovery, scope, authorization);
    previous = connection.enrollmentProgress;
    if (
      previous?.source === 'complete' &&
      sameSyncConnectionIdentity(previous.authorization, authorization)
    ) {
      await discovery.done;
      return null;
    }
    const continued =
      previous && sameSyncConnectionIdentity(previous.authorization, authorization)
        ? previous
        : undefined;
    source = sources.find((candidate) => candidate.kind === continued?.source) ?? sources[0];
    keys = await discovery
      .objectStore(source.store)
      .getAllKeys(
        continued?.afterKey == null ? undefined : IDBKeyRange.lowerBound(continued.afterKey, true),
        65
      );
    await discovery.done;
  } catch (error) {
    await abort(discovery);
    throw error;
  }
  return { previous, keys, source };
}

async function captureDiscoveredRoot(
  db: NonNullable<ReturnType<typeof capturePreparedDatabase>>,
  scope: SyncQueueScope,
  authorization: SyncConnectionIdentity,
  source: (typeof sources)[number],
  key: string
): Promise<'captured' | 'existing' | 'refused'> {
  const tx = db.transaction(captureStores, 'readwrite');
  try {
    await admission(tx, scope, authorization);
    // Deletion between discovery and capture must not become a resurrection.
    const exists: unknown = await tx.objectStore(source.store).get(key);
    if (exists === undefined) {
      await tx.done;
      return 'existing';
    }
    const captured = await captureMissingRoot(tx, scope, source.kind, key);
    await tx.done;
    return captured ? 'captured' : 'existing';
  } catch (error) {
    await abort(tx);
    if (!(error instanceof UnsupportedSyncCaptureGraphError)) throw error;
    // A known unsupported native graph is reported; no partial dependency captures survive.
    return 'refused';
  }
}

async function commitEnrollmentProgress(
  db: NonNullable<ReturnType<typeof capturePreparedDatabase>>,
  scope: SyncQueueScope,
  authorization: SyncConnectionIdentity,
  page: NonNullable<Awaited<ReturnType<typeof discoverRootPage>>>,
  result: EnrollmentResult
) {
  const { previous, keys, source } = page;
  const tx = db.transaction(
    [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE],
    'readwrite'
  );
  try {
    const connection = await admission(tx, scope, authorization);
    if (JSON.stringify(connection.enrollmentProgress) !== JSON.stringify(previous)) {
      await tx.done;
      return result;
    }
    const revision = (previous?.revision ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('Initial sync enrollment exhausted.');
    const next = sources[sources.indexOf(source) + 1];
    const progress: SyncQueueEnrollmentProgress = {
      authorization,
      revision,
      source: keys.length > 64 ? source.kind : (next?.kind ?? 'complete'),
      afterKey: keys.length > 64 ? keys[63]! : null,
    };
    await tx.objectStore(SYNC_OUTBOX_STORE).put({ ...connection, enrollmentProgress: progress });
    await tx.done;
    result.remaining = progress.source !== 'complete';
    if (result.remaining && keys.length === 0) result.advanced = true;
    return result;
  } catch (error) {
    await abort(tx);
    throw error;
  }
}

/** Capture at most 64 pre-enrollment native roots without network or another persistence engine. */
export async function discoverInitialSyncRoots(
  scopeInput: unknown,
  authorizationInput: unknown
): Promise<EnrollmentResult> {
  const db = capturePreparedDatabase();
  const scope = parseSyncQueueScope(structuredClone(scopeInput));
  const authorization = parseSyncConnectionIdentity(structuredClone(authorizationInput));
  if (!db || !scope || !authorization) throw new Error('Initial sync enrollment refused.');
  return runWithPersistenceMutationPermit(async () => {
    const page = await discoverRootPage(db, scope, authorization);
    const result: EnrollmentResult = { captured: 0, existing: 0, refused: 0, remaining: true };
    if (!page) return { ...result, remaining: false };
    for (const key of page.keys.slice(0, 64)) {
      if (typeof key !== 'string' || !key || key.length > 256) {
        result.refused += 1;
        continue;
      }
      const outcome = await captureDiscoveredRoot(db, scope, authorization, page.source, key);
      result[outcome] += 1;
    }
    return commitEnrollmentProgress(db, scope, authorization, page, result);
  });
}
