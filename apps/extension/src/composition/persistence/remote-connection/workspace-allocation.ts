import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { capturePreparedDatabase, initDB } from '../infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
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

/** Durable allocation evidence only; an allocated root does not install a capture profile. */
interface SyncWorkspaceAllocation {
  version: 1;
  kind: 'sync-workspace-allocation';
  key: 'workspace-allocation';
  provider: 'webdav';
  parentUrl: string;
  rootUrl: string;
  accountId: string;
  spaceId: string;
  bootstrapId: string;
  createdAt: number;
  identity: SyncConnectionIdentity;
  phase: 'planned' | 'allocating' | 'allocated' | 'abandoned';
}
type AllocationTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
function refused(): never {
  throw new Error('Sync workspace allocation admission refused.');
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function account(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1024 &&
    Array.from(value).every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
    )
  );
}
function parseAllocation(value: unknown): SyncWorkspaceAllocation | null {
  if (
    !isRecord(value) ||
    !exact(value, [
      'version',
      'kind',
      'key',
      'provider',
      'parentUrl',
      'rootUrl',
      'accountId',
      'spaceId',
      'bootstrapId',
      'createdAt',
      'identity',
      'phase',
    ]) ||
    value['version'] !== 1 ||
    value['kind'] !== 'sync-workspace-allocation' ||
    value['key'] !== 'workspace-allocation' ||
    value['provider'] !== 'webdav' ||
    !account(value['accountId']) ||
    !connectionUuid(value['spaceId']) ||
    !connectionUuid(value['bootstrapId']) ||
    typeof value['createdAt'] !== 'number' ||
    !Number.isSafeInteger(value['createdAt']) ||
    value['createdAt'] < 0
  )
    return null;
  const parentUrl = parseConnectionRootUrl(value['parentUrl']);
  const rootUrl = parseConnectionRootUrl(value['rootUrl']);
  const identity = parseSyncConnectionIdentity(value['identity']);
  const phase = value['phase'];
  if (
    !parentUrl ||
    !rootUrl ||
    !identity ||
    rootUrl !== `${parentUrl}Sniptale-${value['bootstrapId']}/` ||
    (phase !== 'planned' &&
      phase !== 'allocating' &&
      phase !== 'allocated' &&
      phase !== 'abandoned')
  )
    return null;
  return {
    version: 1,
    kind: 'sync-workspace-allocation',
    key: 'workspace-allocation',
    provider: 'webdav',
    parentUrl,
    rootUrl,
    accountId: value['accountId'],
    spaceId: value['spaceId'],
    bootstrapId: value['bootstrapId'],
    createdAt: value['createdAt'],
    identity,
    phase,
  };
}
async function readAllocation(tx: AllocationTransaction): Promise<SyncWorkspaceAllocation | null> {
  const raw: unknown = await tx.objectStore(SYNC_CONNECTION_STORE).get('workspace-allocation');
  return raw === undefined ? null : (parseAllocation(raw) ?? refused());
}
async function checkUnenrolled(tx: AllocationTransaction): Promise<void> {
  const profile: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get('profile');
  const connection: unknown = await tx.objectStore(SYNC_CONNECTION_STORE).get('connection');
  if (profile !== undefined || connection !== undefined) refused();
}
async function mutate(
  operation: (
    tx: IDBPTransaction<unknown, string[], 'readwrite'>
  ) => Promise<SyncWorkspaceAllocation>
): Promise<SyncWorkspaceAllocation> {
  // Capture the prepared native handle before waiting. Erasure closes it; never reopen here.
  const db = capturePreparedDatabase();
  if (!db) return refused();
  const result = await withSyncConnectionAdmissionLock(() =>
    runWithPersistenceMutationPermit(async () => {
      const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE], 'readwrite');
      try {
        await checkUnenrolled(tx);
        const allocation = await operation(tx);
        await tx.done;
        return allocation;
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
  return result;
}
/** Plan a native-generated child before remote IO. Cold admission refuses. Erasure closes the captured handle. */
export async function createSyncWorkspaceAllocation(
  input: unknown,
  expectedInput: unknown = null
): Promise<SyncWorkspaceAllocation> {
  const detached: unknown = structuredClone(input);
  const expected =
    expectedInput === null ? null : parseSyncConnectionIdentity(structuredClone(expectedInput));
  if (
    !isRecord(detached) ||
    !exact(detached, ['parentUrl', 'accountId']) ||
    !account(detached['accountId']) ||
    (expectedInput !== null && !expected)
  )
    return refused();
  const parentUrl = parseConnectionRootUrl(detached['parentUrl']);
  if (!parentUrl) return refused();
  const accountId = detached['accountId'];
  return mutate(async (tx) => {
    const current = await readAllocation(tx);
    if (
      current
        ? current.phase !== 'abandoned' ||
          !expected ||
          !sameSyncConnectionIdentity(current.identity, expected)
        : expected !== null
    )
      return refused();
    const bootstrapId = crypto.randomUUID();
    const allocation = parseAllocation({
      version: 1,
      kind: 'sync-workspace-allocation',
      key: 'workspace-allocation',
      provider: 'webdav',
      parentUrl,
      rootUrl: `${parentUrl}Sniptale-${bootstrapId}/`,
      accountId,
      spaceId: crypto.randomUUID(),
      bootstrapId,
      createdAt: Date.now(),
      identity: { incarnation: crypto.randomUUID(), revision: 1 },
      phase: 'planned',
    });
    if (!allocation) return refused();
    await tx.objectStore(SYNC_CONNECTION_STORE).put(allocation);
    return allocation;
  });
}
/** Read existing evidence without repair, initialization, credentials or remote effects. */
export async function loadSyncWorkspaceAllocation(): Promise<SyncWorkspaceAllocation | null> {
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE], 'readonly');
  try {
    await checkUnenrolled(tx);
    const allocation = await readAllocation(tx);
    await tx.done;
    return allocation;
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  }
}
/** Apply one exact CAS transition. Retrying a successful command is a refusal. */
export async function commandSyncWorkspaceAllocation(
  identityInput: unknown,
  actionInput: unknown
): Promise<SyncWorkspaceAllocation> {
  const identity = parseSyncConnectionIdentity(structuredClone(identityInput));
  if (
    !identity ||
    (actionInput !== 'allocate' && actionInput !== 'confirm' && actionInput !== 'abandon')
  )
    return refused();
  return mutate(async (tx) => {
    const current = await readAllocation(tx);
    if (
      !current ||
      !sameSyncConnectionIdentity(current.identity, identity) ||
      !Number.isSafeInteger(identity.revision + 1) ||
      current.phase === 'abandoned' ||
      (actionInput === 'allocate' && current.phase !== 'planned') ||
      (actionInput === 'confirm' && current.phase !== 'allocating')
    )
      return refused();
    const allocation: SyncWorkspaceAllocation = {
      ...current,
      identity: { incarnation: identity.incarnation, revision: identity.revision + 1 },
      phase:
        actionInput === 'allocate'
          ? 'allocating'
          : actionInput === 'confirm'
            ? 'allocated'
            : 'abandoned',
    };
    await tx.objectStore(SYNC_CONNECTION_STORE).put(allocation);
    return allocation;
  });
}
