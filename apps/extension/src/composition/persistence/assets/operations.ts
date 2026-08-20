import { ASSET_OPERATIONS_STORE, initDB } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { deleteAssetObject } from './opfs-store';
import { parseBackupAssetOperation } from './guards';
import type {
  AssetOperation,
  AssetOperationCompensation,
  AssetOperationStatus,
  PhysicalDeleteAssetOperation,
} from './contracts';

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
