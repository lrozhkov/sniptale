import { connectionText, connectionExact as exact } from './model';
import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  parseSyncWorkspaceIdentity,
  type SyncWorkspaceIdentity,
} from '../../../contracts/sync-workspace';
import { capturePreparedDatabase, initDB } from '../infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  SYNC_OUTBOX_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { withSyncConnectionAdmissionLock } from './coordination';
import {
  connectionUuid,
  parseConnectionRootUrl,
  parseSyncConnectionIdentity,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from './model';
import { readSyncWorkspaceAllocation } from './workspace-allocation';

/** Native read-only JOIN selection. Checked evidence grants no network authority. */
export interface SyncWorkspaceJoin {
  version: 1;
  kind: 'sync-workspace-join';
  key: 'workspace-join';
  provider: 'webdav';
  rootUrl: string;
  accountId: string;
  createdAt: number;
  identity: SyncConnectionIdentity;
  phase: 'planned' | 'checking' | 'ready';
  expected: SyncWorkspaceIdentity | null;
  workspace: SyncWorkspaceIdentity | null;
}
type JoinTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
const stores = [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE];
function refused(): never {
  throw new Error('Sync workspace join admission refused.');
}
function sameWorkspace(left: SyncWorkspaceIdentity, right: SyncWorkspaceIdentity): boolean {
  return (
    left.spaceId === right.spaceId &&
    left.bootstrapId === right.bootstrapId &&
    left.fingerprint === right.fingerprint
  );
}
function parseJoin(value: unknown): SyncWorkspaceJoin | null {
  if (
    !isRecord(value) ||
    !exact(value, [
      'version',
      'kind',
      'key',
      'provider',
      'rootUrl',
      'accountId',
      'createdAt',
      'identity',
      'phase',
      'expected',
      'workspace',
    ]) ||
    value['version'] !== 1 ||
    value['kind'] !== 'sync-workspace-join' ||
    value['key'] !== 'workspace-join' ||
    value['provider'] !== 'webdav' ||
    !connectionText(value['accountId'], 1024) ||
    typeof value['createdAt'] !== 'number' ||
    !Number.isSafeInteger(value['createdAt']) ||
    value['createdAt'] < 0
  )
    return null;
  const rootUrl = parseConnectionRootUrl(value['rootUrl']);
  const identity = parseSyncConnectionIdentity(value['identity']);
  const phase = value['phase'];
  if (!rootUrl || !identity || (phase !== 'planned' && phase !== 'checking' && phase !== 'ready'))
    return null;
  try {
    const expected = parseSyncWorkspaceIdentity(value['expected']);
    const workspace = parseSyncWorkspaceIdentity(value['workspace']);
    if (
      phase === 'ready'
        ? !workspace || !expected || !sameWorkspace(workspace, expected)
        : workspace !== null
    )
      return null;
    return {
      version: 1,
      kind: 'sync-workspace-join',
      key: 'workspace-join',
      provider: 'webdav',
      rootUrl,
      accountId: value['accountId'],
      createdAt: value['createdAt'],
      identity,
      phase,
      expected,
      workspace,
    };
  } catch {
    return null;
  }
}
/** Read JOIN evidence without repair inside the caller transaction. */
export async function readSyncWorkspaceJoin(
  tx: JoinTransaction
): Promise<SyncWorkspaceJoin | null> {
  const raw: unknown = await tx.objectStore(SYNC_CONNECTION_STORE).get('workspace-join');
  return raw === undefined ? null : (parseJoin(raw) ?? refused());
}
async function checkUnenrolled(tx: JoinTransaction): Promise<void> {
  if (
    (await tx.objectStore(SYNC_CAPTURE_STORE).count()) !== 0 ||
    (await tx.objectStore(SYNC_OUTBOX_STORE).count()) !== 0
  )
    return refused();
  const allocation = await readSyncWorkspaceAllocation(tx);
  if (allocation && allocation.phase !== 'abandoned') return refused();
  const rows = tx.objectStore(SYNC_CONNECTION_STORE);
  const join: unknown = await rows.get('workspace-join');
  const expectedRows = (allocation ? 1 : 0) + (join === undefined ? 0 : 1);
  if ((await rows.count()) !== expectedRows) return refused();
}
async function mutate<T>(
  operation: (tx: IDBPTransaction<unknown, string[], 'readwrite'>) => Promise<T>
): Promise<T> {
  // Capture before admission waits; erasure closes this handle instead of authorizing a reopen.
  const db = capturePreparedDatabase();
  if (!db) return refused();
  return withSyncConnectionAdmissionLock(() =>
    runWithPersistenceMutationPermit(async () => {
      const tx = db.transaction(stores, 'readwrite');
      try {
        await checkUnenrolled(tx);
        const result = await operation(tx);
        await tx.done;
        return result;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* Transaction can already be closed. */
        }
        await tx.done.catch(() => undefined);
        throw error;
      }
    })
  );
}
/** Select a root before remote reads, replacing only an exact prior JOIN selection. */
export async function createSyncWorkspaceJoin(
  input: unknown,
  expectedIdentityInput: unknown = null
): Promise<SyncWorkspaceJoin> {
  const detached: unknown = structuredClone(input);
  const expectedIdentity =
    expectedIdentityInput === null
      ? null
      : parseSyncConnectionIdentity(structuredClone(expectedIdentityInput));
  if (
    !isRecord(detached) ||
    !exact(detached, ['rootUrl', 'accountId', 'expected']) ||
    !connectionText(detached['accountId'], 1024) ||
    (expectedIdentityInput !== null && !expectedIdentity)
  )
    return refused();
  const rootUrl = parseConnectionRootUrl(detached['rootUrl']);
  if (!rootUrl) return refused();
  let expected: SyncWorkspaceIdentity | null;
  try {
    expected = parseSyncWorkspaceIdentity(detached['expected']);
  } catch {
    return refused();
  }
  const accountId = detached['accountId'];
  return mutate(async (tx) => {
    const current = await readSyncWorkspaceJoin(tx);
    if (
      current
        ? !expectedIdentity || !sameSyncConnectionIdentity(current.identity, expectedIdentity)
        : expectedIdentity !== null
    )
      return refused();
    const join = parseJoin({
      version: 1,
      kind: 'sync-workspace-join',
      key: 'workspace-join',
      provider: 'webdav',
      rootUrl,
      accountId,
      expected,
      workspace: null,
      createdAt: Date.now(),
      identity: { incarnation: crypto.randomUUID(), revision: 1 },
      phase: 'planned',
    });
    if (!join) return refused();
    await tx.objectStore(SYNC_CONNECTION_STORE).put(join);
    return join;
  });
}
/** Load without repair or writes; preparation remains with the database owner. */
export async function loadSyncWorkspaceJoin(): Promise<SyncWorkspaceJoin | null> {
  const db = await initDB();
  const tx = db.transaction(stores, 'readonly');
  try {
    await checkUnenrolled(tx);
    const join = await readSyncWorkspaceJoin(tx);
    await tx.done;
    return join;
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  }
}
/** Start an exact new checking revision and preserve a previously checked marker binding. */
export async function beginSyncWorkspaceJoin(identityInput: unknown): Promise<SyncWorkspaceJoin> {
  const identity = parseSyncConnectionIdentity(structuredClone(identityInput));
  if (!identity || !Number.isSafeInteger(identity.revision + 1)) return refused();
  return mutate(async (tx) => {
    const current = await readSyncWorkspaceJoin(tx);
    if (!current || !sameSyncConnectionIdentity(current.identity, identity)) return refused();
    const join: SyncWorkspaceJoin = {
      ...current,
      phase: 'checking',
      workspace: null,
      expected: current.workspace ?? current.expected,
      identity: { incarnation: identity.incarnation, revision: identity.revision + 1 },
    };
    await tx.objectStore(SYNC_CONNECTION_STORE).put(join);
    return join;
  });
}
/** Store checked marker evidence only for the exact checking revision. */
export async function completeSyncWorkspaceJoin(
  identityInput: unknown,
  evidenceInput: unknown
): Promise<SyncWorkspaceJoin> {
  const identity = parseSyncConnectionIdentity(structuredClone(identityInput));
  let evidence: SyncWorkspaceIdentity | null;
  try {
    evidence = parseSyncWorkspaceIdentity(structuredClone(evidenceInput));
  } catch {
    return refused();
  }
  if (!identity || !evidence || !Number.isSafeInteger(identity.revision + 1)) return refused();
  const workspace = evidence;
  return mutate(async (tx) => {
    const current = await readSyncWorkspaceJoin(tx);
    if (
      !current ||
      current.phase !== 'checking' ||
      !sameSyncConnectionIdentity(current.identity, identity) ||
      (current.expected !== null && !sameWorkspace(current.expected, workspace))
    )
      return refused();
    const join: SyncWorkspaceJoin = {
      ...current,
      phase: 'ready',
      expected: workspace,
      workspace,
      identity: { incarnation: identity.incarnation, revision: identity.revision + 1 },
    };
    await tx.objectStore(SYNC_CONNECTION_STORE).put(join);
    return join;
  });
}
/** Delete an exact selection without remote cleanup. */
export async function abandonSyncWorkspaceJoin(identityInput: unknown): Promise<void> {
  const identity = parseSyncConnectionIdentity(structuredClone(identityInput));
  if (!identity) return refused();
  return mutate(async (tx) => {
    const current = await readSyncWorkspaceJoin(tx);
    if (!current || !sameSyncConnectionIdentity(current.identity, identity)) return refused();
    await tx.objectStore(SYNC_CONNECTION_STORE).delete('workspace-join');
  });
}
/** Revoke this lifetime regardless of phase advances; absence is already revoked. */
export async function revokeSyncWorkspaceJoin(incarnationInput: unknown): Promise<void> {
  const incarnation: unknown = structuredClone(incarnationInput);
  if (!connectionUuid(incarnation)) return refused();
  return mutate(async (tx) => {
    const current = await readSyncWorkspaceJoin(tx);
    if (!current) return;
    if (current.identity.incarnation !== incarnation) return refused();
    await tx.objectStore(SYNC_CONNECTION_STORE).delete('workspace-join');
  });
}
/** Read exact ready evidence inside enrollment, including receipt replay after installation. */
export async function readReadySyncWorkspaceJoin(
  tx: JoinTransaction,
  expected: SyncConnectionIdentity
): Promise<SyncWorkspaceJoin> {
  const current = await readSyncWorkspaceJoin(tx);
  if (
    !current ||
    current.phase !== 'ready' ||
    !current.workspace ||
    !sameSyncConnectionIdentity(current.identity, expected)
  )
    return refused();
  return current;
}
