import type { IDBPTransaction } from 'idb';
import type { IndexedDbWriteTransaction } from '../infrastructure/indexed-db/core';
import { ASSET_RESIDENCY_STORE } from '../infrastructure/indexed-db/core.stores';
import {
  isActivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import type { CaptureRootKind } from '../sync-capture/contracts';
import {
  assetResidencyCopyId,
  assetResidencyRootId,
  parseAssetResidencyRecord,
  DEFAULT_ASSET_RESIDENCY_BUDGET_BYTES,
  type AssetResidencyCopy,
  type AssetResidencyRecord,
  type AssetResidencyRemote,
  type AssetResidencyRoot,
  type AssetResidencySettings,
  type AssetResidencyTarget,
} from './residency-records';

type Transaction = Pick<IndexedDbWriteTransaction, 'objectStore'>;
type ReadTransaction = Pick<
  IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  'objectStore'
>;
export interface AssetResidencyUnloadDraft {
  operationId: string;
  target: AssetResidencyTarget;
  remote: AssetResidencyRemote;
  lastUsedAt: number;
}
function admitted(permit: PersistenceMutationPermit): void {
  if (!isActivePersistenceMutationPermit(permit))
    throw new Error('Asset residency mutation permit is not active.');
}
function nextRevision(revision: number): number {
  if (!Number.isSafeInteger(revision + 1))
    throw new Error('Asset residency revision is exhausted.');
  return revision + 1;
}
async function read(tx: ReadTransaction, id: string): Promise<AssetResidencyRecord | null> {
  const value: unknown = await tx.objectStore(ASSET_RESIDENCY_STORE).get(id);
  if (value === undefined) return null;
  const parsed = parseAssetResidencyRecord(value);
  if (!parsed || parsed.id !== id) throw new Error('Stored asset residency record is invalid.');
  return parsed;
}
async function write<T extends AssetResidencyRecord>(
  tx: Transaction,
  record: T,
  permit: PersistenceMutationPermit
): Promise<T> {
  const parsed = parseAssetResidencyRecord(record);
  if (!parsed) throw new Error('Asset residency command is invalid.');
  admitted(permit);
  await tx.objectStore(ASSET_RESIDENCY_STORE).put(parsed);
  admitted(permit);
  return record;
}
function sameCommand(left: AssetResidencyCopy, right: AssetResidencyCopy): boolean {
  return (
    left.operationId === right.operationId &&
    JSON.stringify(left.target) === JSON.stringify(right.target) &&
    JSON.stringify(left.remote) === JSON.stringify(right.remote)
  );
}

/** Read exact durable recovery evidence; malformed evidence never becomes an absent record. */
export async function readAssetResidencyCopyInTransaction(
  tx: ReadTransaction,
  id: string
): Promise<AssetResidencyCopy | null> {
  const record = await read(tx, id);
  if (record && record.kind !== 'copy')
    throw new Error('Asset residency copy identity is invalid.');
  return record;
}

/** Admit a new native reference whose bytes remain remote; this command performs no deletion. */
export async function admitRemoteAssetResidencyInTransaction(
  tx: Transaction,
  draft: AssetResidencyUnloadDraft,
  permit: PersistenceMutationPermit
): Promise<AssetResidencyCopy> {
  admitted(permit);
  const candidate = parseAssetResidencyRecord({
    version: 1,
    kind: 'copy',
    id: assetResidencyCopyId(draft.target),
    revision: 1,
    operationId: draft.operationId,
    phase: 'unloaded',
    target: draft.target,
    remote: draft.remote,
    lastUsedAt: draft.lastUsedAt,
  });
  if (!candidate || candidate.kind !== 'copy' || candidate.target.kind !== 'opfs')
    throw new Error('Remote asset residency command is invalid.');
  const current = await readAssetResidencyCopyInTransaction(tx, candidate.id);
  if (current) {
    if (sameCommand(current, candidate)) return current;
    throw new Error('Remote asset residency identity is already claimed.');
  }
  return write(tx, candidate, permit);
}

/** Record unload intent only. The caller owns native safety admission and aborts its transaction on failure. */
export async function beginAssetResidencyUnloadInTransaction(
  tx: Transaction,
  draft: AssetResidencyUnloadDraft,
  expectedRevision: number | null,
  permit: PersistenceMutationPermit
): Promise<AssetResidencyCopy> {
  admitted(permit);
  const candidate = parseAssetResidencyRecord({
    version: 1,
    kind: 'copy',
    id: assetResidencyCopyId(draft.target),
    revision: 1,
    operationId: draft.operationId,
    phase: 'unloading',
    target: draft.target,
    remote: draft.remote,
    lastUsedAt: draft.lastUsedAt,
  });
  if (!candidate || candidate.kind !== 'copy')
    throw new Error('Asset residency unload command is invalid.');
  const current = await readAssetResidencyCopyInTransaction(tx, candidate.id);
  admitted(permit);
  if (current && sameCommand(current, candidate)) {
    if (current.phase === 'unloading' || current.phase === 'unloaded') return current;
    throw new Error('Completed asset residency operation cannot restart.');
  }
  if (
    current
      ? current.phase !== 'resident' || current.revision !== expectedRevision
      : expectedRevision !== null
  ) {
    throw new Error('Asset residency unload revision is stale.');
  }
  if (current?.operationId === candidate.operationId)
    throw new Error('Asset residency operation source does not match.');
  return write(
    tx,
    {
      ...candidate,
      revision: nextRevision(current?.revision ?? 0),
      lastUsedAt: Math.max(candidate.lastUsedAt, current?.lastUsedAt ?? 0),
    },
    permit
  );
}

/** Settle a physical result with exact phase CAS; this metadata capability does not authorize byte deletion. */
export async function finishAssetResidencyTransitionInTransaction(
  tx: Transaction,
  expectedCopy: AssetResidencyCopy,
  nextPhase: 'unloaded' | 'resident',
  permit: PersistenceMutationPermit
): Promise<AssetResidencyCopy> {
  admitted(permit);
  const expected = parseAssetResidencyRecord(expectedCopy);
  if (
    !expected ||
    expected.kind !== 'copy' ||
    (nextPhase === 'unloaded'
      ? expected.phase !== 'unloading'
      : expected.phase !== 'unloaded' && expected.phase !== 'unloading')
  ) {
    throw new Error('Asset residency transition is invalid.');
  }
  const current = await readAssetResidencyCopyInTransaction(tx, expected.id);
  admitted(permit);
  if (!current || !sameCommand(current, expected))
    throw new Error('Asset residency transition source is stale.');
  const completed = { ...expected, revision: nextRevision(expected.revision), phase: nextPhase };
  if (JSON.stringify(current) === JSON.stringify(completed)) return current;
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error('Asset residency transition revision is stale.');
  return write(tx, completed, permit);
}

async function page(tx: ReadTransaction, kind: 'copy' | 'root', afterId?: string) {
  const prefix = `["${kind}",`;
  if (afterId !== undefined && !afterId.startsWith(prefix))
    throw new Error('Asset residency page cursor is invalid.');
  const keys = await tx
    .objectStore(ASSET_RESIDENCY_STORE)
    .getAllKeys(
      IDBKeyRange.bound(afterId ?? prefix, `${prefix}\uffff`, afterId !== undefined, false),
      64
    );
  const records: AssetResidencyRecord[] = [];
  for (const key of keys) {
    if (typeof key !== 'string') throw new Error('Asset residency page key is invalid.');
    const record = await read(tx, key);
    if (!record || record.kind !== kind) throw new Error('Asset residency page record is invalid.');
    records.push(record);
  }
  const last = keys[keys.length - 1];
  return { records, nextId: keys.length === 64 && typeof last === 'string' ? last : null };
}
/** Read at most 64 copy keys, without loading unrelated root or Settings records. */
export async function readAssetResidencyCopiesPageInTransaction(
  tx: ReadTransaction,
  afterId?: string
): Promise<{ records: AssetResidencyCopy[]; nextId: string | null }> {
  const result = await page(tx, 'copy', afterId);
  return {
    ...result,
    records: result.records.filter(
      (record): record is AssetResidencyCopy => record.kind === 'copy'
    ),
  };
}
/** Read at most 64 durable root intents. */
export async function readAssetResidencyRootsPageInTransaction(
  tx: ReadTransaction,
  afterId?: string
): Promise<{ records: AssetResidencyRoot[]; nextId: string | null }> {
  const result = await page(tx, 'root', afterId);
  return {
    ...result,
    records: result.records.filter(
      (record): record is AssetResidencyRoot => record.kind === 'root'
    ),
  };
}

/** Absent Settings use one soft originals budget without creating a row on read. */
export async function readAssetResidencySettingsInTransaction(
  tx: ReadTransaction
): Promise<AssetResidencySettings> {
  const record = await read(tx, 'settings');
  if (record && record.kind !== 'settings')
    throw new Error('Asset residency Settings identity is invalid.');
  return (
    record ?? {
      version: 1,
      kind: 'settings',
      id: 'settings',
      revision: 0,
      budgetBytes: DEFAULT_ASSET_RESIDENCY_BUDGET_BYTES,
    }
  );
}
/** Compare the current Settings revision; zero bytes is a supported soft budget. */
export async function setAssetResidencyBudgetInTransaction(
  tx: Transaction,
  budgetBytes: number,
  expectedRevision: number,
  permit: PersistenceMutationPermit
): Promise<AssetResidencySettings> {
  admitted(permit);
  const current = await readAssetResidencySettingsInTransaction(tx);
  if (current.revision !== expectedRevision)
    throw new Error('Asset residency Settings revision is stale.');
  return write(tx, { ...current, revision: nextRevision(current.revision), budgetBytes }, permit);
}
/** Read a pin intent without computing or persisting a parallel editing graph. */
export async function readAssetResidencyRootInTransaction(
  tx: ReadTransaction,
  kind: CaptureRootKind,
  rootId: string
): Promise<AssetResidencyRoot | null> {
  const record = await read(tx, assetResidencyRootId(kind, rootId));
  if (record && record.kind !== 'root')
    throw new Error('Asset residency root identity is invalid.');
  return record;
}
async function mergeRoot(
  tx: Transaction,
  kind: CaptureRootKind,
  rootId: string,
  lastUsedAt: number,
  pinned: boolean | undefined,
  permit: PersistenceMutationPermit
): Promise<AssetResidencyRoot> {
  admitted(permit);
  const current = await readAssetResidencyRootInTransaction(tx, kind, rootId);
  if (!Number.isSafeInteger(lastUsedAt) || lastUsedAt < 0)
    throw new Error('Asset residency root usage is invalid.');
  return write(
    tx,
    {
      version: 1,
      kind: 'root',
      id: assetResidencyRootId(kind, rootId),
      revision: nextRevision(current?.revision ?? 0),
      rootKind: kind,
      rootId,
      lastUsedAt: Math.max(lastUsedAt, current?.lastUsedAt ?? 0),
      pinned: pinned ?? current?.pinned ?? false,
    },
    permit
  );
}
/** A delayed usage update reloads and preserves the current user pin intent. */
export function touchAssetResidencyRootInTransaction(
  tx: Transaction,
  kind: CaptureRootKind,
  rootId: string,
  lastUsedAt: number,
  permit: PersistenceMutationPermit
): Promise<AssetResidencyRoot> {
  return mergeRoot(tx, kind, rootId, lastUsedAt, undefined, permit);
}
/** Change only this root's pin intent and merge its latest usage timestamp. */
export function setAssetResidencyRootPinnedInTransaction(
  tx: Transaction,
  kind: CaptureRootKind,
  rootId: string,
  pinned: boolean,
  lastUsedAt: number,
  permit: PersistenceMutationPermit
): Promise<AssetResidencyRoot> {
  return mergeRoot(tx, kind, rootId, lastUsedAt, pinned, permit);
}

/** Retire exact old recovery metadata in the same transaction that replaces its native source. */
export async function retireAssetResidencyCopyInTransaction(
  tx: Transaction,
  expectedCopy: AssetResidencyCopy,
  permit: PersistenceMutationPermit
): Promise<void> {
  admitted(permit);
  const expected = parseAssetResidencyRecord(expectedCopy);
  if (!expected || expected.kind !== 'copy')
    throw new Error('Asset residency retirement is invalid.');
  const current = await readAssetResidencyCopyInTransaction(tx, expected.id);
  admitted(permit);
  if (current === null) return;
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error('Asset residency retirement source is stale.');
  await tx.objectStore(ASSET_RESIDENCY_STORE).delete(expected.id);
  admitted(permit);
}
