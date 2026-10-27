import type { IDBPTransaction } from 'idb';
import {
  encodeSyncWorkspaceMarker,
  parseSyncWorkspaceIdentity,
  parseSyncWorkspaceMarker,
} from '../../../contracts/sync-workspace';
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
interface AllocationFields {
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
}
type InitialPhase = 'planned' | 'allocating' | 'allocated' | 'abandoned';
/** Native journal evidence; marker bytes become immutable before remote publication. */
export interface SyncWorkspaceAllocation extends AllocationFields {
  version: 2;
  phase: InitialPhase | 'preparing-marker' | 'publishing-marker' | 'ready';
  marker: { text: string; fingerprint: string } | null;
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
      ...(value['version'] === 2 ? ['marker'] : []),
    ]) ||
    (value['version'] !== 1 && value['version'] !== 2) ||
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
      phase !== 'abandoned' &&
      !(
        value['version'] === 2 &&
        (phase === 'preparing-marker' || phase === 'publishing-marker' || phase === 'ready')
      ))
  )
    return null;
  const fields: AllocationFields = {
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
  };
  if (value['version'] === 1) {
    if (
      phase !== 'planned' &&
      phase !== 'allocating' &&
      phase !== 'allocated' &&
      phase !== 'abandoned'
    )
      return null;
    return { ...fields, version: 2, phase, marker: null };
  }
  const marker = value['marker'];
  if (marker === null) {
    if (
      phase !== 'planned' &&
      phase !== 'allocating' &&
      phase !== 'allocated' &&
      phase !== 'abandoned'
    )
      return null;
    return { ...fields, version: 2, phase, marker: null };
  }
  if (
    !isRecord(marker) ||
    !exact(marker, ['text', 'fingerprint']) ||
    typeof marker['text'] !== 'string'
  )
    return null;
  try {
    const parsed = parseSyncWorkspaceMarker(marker['text']);
    if (
      parsed.spaceId !== fields.spaceId ||
      parsed.bootstrapId !== fields.bootstrapId ||
      parsed.fingerprint !== marker['fingerprint'] ||
      (phase !== 'preparing-marker' &&
        phase !== 'publishing-marker' &&
        phase !== 'ready' &&
        phase !== 'abandoned')
    )
      return null;
    return {
      ...fields,
      version: 2,
      phase,
      marker: { text: marker['text'], fingerprint: parsed.fingerprint },
    };
  } catch {
    return null;
  }
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
      version: 2,
      marker: null,
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
    (actionInput !== 'allocate' &&
      actionInput !== 'confirm' &&
      actionInput !== 'abandon' &&
      actionInput !== 'publish-marker')
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
      (actionInput === 'confirm' && current.phase !== 'allocating') ||
      (actionInput === 'publish-marker' &&
        current.phase !== 'preparing-marker' &&
        current.phase !== 'publishing-marker')
    )
      return refused();
    const allocation = parseAllocation({
      ...current,
      version: 2,
      marker: current.marker ?? null,
      identity: { incarnation: identity.incarnation, revision: identity.revision + 1 },
      phase:
        actionInput === 'allocate'
          ? 'allocating'
          : actionInput === 'confirm'
            ? 'allocated'
            : actionInput === 'publish-marker'
              ? 'publishing-marker'
              : 'abandoned',
    });
    if (!allocation) return refused();
    await tx.objectStore(SYNC_CONNECTION_STORE).put(allocation);
    return allocation;
  });
}

/** Freeze canonical marker bytes once, after positive root allocation evidence. */
export async function prepareSyncWorkspaceMarker(
  expectedInput: unknown
): Promise<SyncWorkspaceAllocation> {
  const identity = parseSyncConnectionIdentity(structuredClone(expectedInput));
  if (!identity || !Number.isSafeInteger(identity.revision + 1)) return refused();
  return mutate(async (tx) => {
    const current = await readAllocation(tx);
    if (
      !current ||
      current.phase !== 'allocated' ||
      !sameSyncConnectionIdentity(current.identity, identity)
    )
      return refused();
    const encoded = encodeSyncWorkspaceMarker(current.spaceId, current.bootstrapId);
    const allocation: SyncWorkspaceAllocation = {
      ...current,
      version: 2,
      identity: { incarnation: identity.incarnation, revision: identity.revision + 1 },
      phase: 'preparing-marker',
      marker: { text: encoded.text, fingerprint: encoded.identity.fingerprint },
    };
    await tx.objectStore(SYNC_CONNECTION_STORE).put(allocation);
    return allocation;
  });
}

/** Record checked publication evidence for this exact frozen marker and command revision. */
export async function completeSyncWorkspaceMarker(
  expectedInput: unknown,
  evidenceInput: unknown
): Promise<SyncWorkspaceAllocation> {
  const identity = parseSyncConnectionIdentity(structuredClone(expectedInput));
  let evidence;
  try {
    evidence = parseSyncWorkspaceIdentity(structuredClone(evidenceInput));
  } catch {
    return refused();
  }
  if (!identity || !evidence || !Number.isSafeInteger(identity.revision + 1)) return refused();
  return mutate(async (tx) => {
    const current = await readAllocation(tx);
    if (
      !current ||
      current.version !== 2 ||
      current.phase !== 'publishing-marker' ||
      !current.marker ||
      !sameSyncConnectionIdentity(current.identity, identity) ||
      evidence.spaceId !== current.spaceId ||
      evidence.bootstrapId !== current.bootstrapId ||
      evidence.fingerprint !== current.marker.fingerprint
    )
      return refused();
    const allocation: SyncWorkspaceAllocation = {
      ...current,
      identity: { incarnation: identity.incarnation, revision: identity.revision + 1 },
      phase: 'ready',
    };
    await tx.objectStore(SYNC_CONNECTION_STORE).put(allocation);
    return allocation;
  });
}
