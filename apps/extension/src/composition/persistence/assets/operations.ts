import { ASSET_OPERATIONS_STORE, initDB } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { deleteAssetObject } from './opfs-store';
import { parseArchiveRestoreSession, parseBackupAssetOperation } from './guards';
import type {
  AssetOperation,
  AssetOperationCompensation,
  AssetOperationStatus,
  PhysicalDeleteAssetOperation,
  ArchiveRestoreSession,
  ArchiveRestoreStrategy,
} from './contracts';

interface ArchiveRestoreSessionStore {
  get(operationId: string): Promise<unknown>;
  put(value: ArchiveRestoreSession): Promise<unknown>;
}

function createOperationId(): string {
  if (typeof crypto.randomUUID !== 'function')
    throw new Error('Secure operation IDs are unavailable.');
  return crypto.randomUUID();
}

export function buildPhysicalDeleteOperation(assetIds: string[]): PhysicalDeleteAssetOperation {
  const now = Date.now();
  return {
    operationId: createOperationId(),
    kind: 'physical-delete',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    assetIds: [...new Set(assetIds)],
  };
}

export async function completePhysicalDeleteOperation(
  operation: PhysicalDeleteAssetOperation
): Promise<void> {
  for (const assetId of operation.assetIds) await deleteAssetObject(assetId);
  await runWithIndexedDbMutation(async (db) =>
    db.delete(ASSET_OPERATIONS_STORE, operation.operationId)
  );
}

export async function createBackupRestoreOperation(): Promise<AssetOperation> {
  const now = Date.now();
  const operation: AssetOperation = {
    operationId: createOperationId(),
    kind: 'backup-restore',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    compensations: [],
    obsoleteAssetIds: [],
  };
  await runWithIndexedDbMutation(async (db) => db.add(ASSET_OPERATIONS_STORE, operation));
  return operation;
}

export async function readAssetOperation(operationId: string): Promise<AssetOperation | undefined> {
  const db = await initDB();
  const value: unknown = await db.get(ASSET_OPERATIONS_STORE, operationId);
  return parseBackupAssetOperation(value) ?? undefined;
}

export async function appendAssetOperationCompensation(
  operationId: string,
  compensation: AssetOperationCompensation
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(ASSET_OPERATIONS_STORE, 'readwrite');
    const store = tx.objectStore(ASSET_OPERATIONS_STORE);
    const operation = parseBackupAssetOperation(await store.get(operationId));
    if (!operation || operation.status !== 'pending')
      throw new Error('Restore operation is not pending.');
    await store.put({
      ...operation,
      compensations: [...operation.compensations, compensation],
      updatedAt: Date.now(),
    });
    await tx.done;
  });
}

export async function transitionAssetOperation(
  operationId: string,
  expected: AssetOperationStatus,
  status: AssetOperationStatus
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(ASSET_OPERATIONS_STORE, 'readwrite');
    const store = tx.objectStore(ASSET_OPERATIONS_STORE);
    const operation = parseBackupAssetOperation(await store.get(operationId));
    if (!operation || operation.status !== expected) {
      throw new Error(`Restore operation is not ${expected}.`);
    }
    await store.put({ ...operation, status, updatedAt: Date.now() });
    await tx.done;
  });
}

export async function createArchiveRestoreSession(args: {
  archiveFingerprint: string;
  strategy: ArchiveRestoreStrategy;
}): Promise<ArchiveRestoreSession> {
  if (!/^[a-f0-9]{64}$/.test(args.archiveFingerprint)) {
    throw new Error('Archive restore fingerprint is invalid.');
  }
  const now = Date.now();
  const session: ArchiveRestoreSession = {
    archiveFingerprint: args.archiveFingerprint,
    committedRoots: [],
    conflictedRoots: [],
    createdAt: now,
    currentRoot: null,
    kind: 'archive-restore-session',
    operationId: createOperationId(),
    rootIdMap: {},
    skippedRoots: [],
    status: 'pending',
    strategy: args.strategy,
    updatedAt: now,
  };
  await runWithIndexedDbMutation(async (db) => db.add(ASSET_OPERATIONS_STORE, session));
  return session;
}

export async function listArchiveRestoreSessions(): Promise<ArchiveRestoreSession[]> {
  const db = await initDB();
  const values: unknown = await db.getAll(ASSET_OPERATIONS_STORE);
  if (!Array.isArray(values)) return [];
  return values
    .map(parseArchiveRestoreSession)
    .filter((value): value is ArchiveRestoreSession => value !== null);
}

export async function readArchiveRestoreSession(
  operationId: string
): Promise<ArchiveRestoreSession | undefined> {
  const db = await initDB();
  return parseArchiveRestoreSession(await db.get(ASSET_OPERATIONS_STORE, operationId)) ?? undefined;
}

async function mutateArchiveRestoreSession(
  operationId: string,
  mutate: (session: ArchiveRestoreSession) => ArchiveRestoreSession
): Promise<ArchiveRestoreSession> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(ASSET_OPERATIONS_STORE, 'readwrite');
    const store = tx.objectStore(ASSET_OPERATIONS_STORE);
    const session = parseArchiveRestoreSession(await store.get(operationId));
    if (!session) throw new Error('Archive restore session is unavailable.');
    const next = mutate(session);
    await store.put(next);
    await tx.done;
    return next;
  });
}

export async function beginArchiveRestoreRoot(
  operationId: string,
  rootKey: string
): Promise<ArchiveRestoreSession> {
  if (rootKey.length === 0) throw new Error('Archive restore root key is invalid.');
  return mutateArchiveRestoreSession(operationId, (session) => {
    if (session.status !== 'pending' || session.currentRoot !== null) {
      throw new Error('Archive restore session is not ready for another root.');
    }
    if (session.committedRoots.includes(rootKey)) {
      throw new Error('Archive restore root is already committed.');
    }
    return { ...session, currentRoot: rootKey, updatedAt: Date.now() };
  });
}

export async function appendCommittedArchiveRootInTransaction(
  store: ArchiveRestoreSessionStore,
  operationId: string,
  rootKey: string,
  targetRootId: string,
  imported = true,
  conflicted = false
): Promise<ArchiveRestoreSession> {
  if (targetRootId.length === 0) throw new Error('Archive restore target root ID is invalid.');
  const session = parseArchiveRestoreSession(await store.get(operationId));
  if (!session || session.status !== 'pending' || session.currentRoot !== rootKey) {
    throw new Error('Archive restore root checkpoint does not match the active session.');
  }
  if (session.committedRoots.includes(rootKey)) {
    throw new Error('Archive restore root is already committed.');
  }
  const next: ArchiveRestoreSession = {
    ...session,
    committedRoots: [...session.committedRoots, rootKey],
    conflictedRoots: conflicted ? [...session.conflictedRoots, rootKey] : session.conflictedRoots,
    currentRoot: null,
    rootIdMap: { ...session.rootIdMap, [rootKey]: targetRootId },
    skippedRoots: imported ? session.skippedRoots : [...session.skippedRoots, rootKey],
    updatedAt: Date.now(),
  };
  await store.put(next);
  return next;
}

export async function clearArchiveRestoreCurrentRoot(
  operationId: string
): Promise<ArchiveRestoreSession> {
  return mutateArchiveRestoreSession(operationId, (session) => {
    if (session.status !== 'pending') return session;
    return { ...session, currentRoot: null, updatedAt: Date.now() };
  });
}

export async function completeArchiveRestoreSession(
  operationId: string
): Promise<ArchiveRestoreSession> {
  return mutateArchiveRestoreSession(operationId, (session) => {
    if (session.status !== 'pending' || session.currentRoot !== null) {
      throw new Error('Archive restore session cannot be completed.');
    }
    return { ...session, status: 'completed', updatedAt: Date.now() };
  });
}

export async function abortArchiveRestoreSession(
  operationId: string
): Promise<ArchiveRestoreSession> {
  return mutateArchiveRestoreSession(operationId, (session) => {
    if (session.status !== 'pending') throw new Error('Archive restore session is not pending.');
    return { ...session, status: 'aborted', updatedAt: Date.now() };
  });
}
