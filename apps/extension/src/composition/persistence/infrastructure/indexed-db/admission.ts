import { openDB, type IDBPDatabase } from 'idb';
import { eraseAssetStorage, countAssetStorageRoots } from '../../assets/opfs-store';
import {
  eraseVideoPreviewCacheForPrivacyErasure,
  verifyVideoPreviewCacheEmptyAfterPrivacyErasure,
} from '../../video-preview-cache/privacy-erasure';
import { privacyErasureBrowserStorage } from '../browser-storage/privacy-erasure';
import {
  ALPHA_RESET_JOURNAL_KEY,
  DATABASE_BACKUP_RECEIPT_KEY,
  DATABASE_RESET_JOURNAL_KEY,
  DB_NAME,
  DB_VERSION,
  EXPECTED_INDEXES,
  EXPECTED_STORES,
  LEGACY_ALPHA_DB_NAMES,
  SCHEMA_CONTRACTS_STORE,
} from './core.stores.ts';
import {
  buildDatabaseMigrationPlan,
  parseStoredSchemaContracts,
  type DatabaseMigrationDescriptor,
} from './schema-contracts.ts';
import { inspectSupportedSourceDatabase } from './fixtures/source-inspection';

export {
  ALPHA_RESET_JOURNAL_KEY,
  DATABASE_BACKUP_RECEIPT_KEY,
  DATABASE_RESET_JOURNAL_KEY,
} from './core.stores.ts';

export type DatabaseAdmissionStatus =
  | {
      databaseVersion: number;
      status: 'ready';
    }
  | {
      databaseVersion: number;
      reason: 'destructive-migration';
      status: 'backup-required';
      targetDatabaseVersion: number;
    }
  | {
      availableBytes: number;
      databaseVersion: number;
      requiredBytes: number;
      status: 'insufficient-space';
      targetDatabaseVersion: number;
    }
  | {
      databaseVersion: number | null;
      reason:
        | 'alpha-reset-required'
        | 'connection-blocked'
        | 'recovery-reset-failed'
        | 'recovery-reset-required';
      status: 'blocked';
    }
  | {
      databaseVersion: number | null;
      reason: 'domain-contracts' | 'indexes' | 'legacy-alpha-collision' | 'stores';
      status: 'corrupt';
    }
  | {
      databaseVersion: number;
      reason: 'future-version' | 'migration-path-missing';
      status: 'unsupported-version';
      targetDatabaseVersion: number;
    };

export class DatabaseAdmissionError extends Error {
  readonly admission: Exclude<DatabaseAdmissionStatus, { status: 'ready' }>;

  constructor(admission: Exclude<DatabaseAdmissionStatus, { status: 'ready' }>) {
    super(`Database admission failed: ${admission.status}`);
    this.name = 'DatabaseAdmissionError';
    this.admission = admission;
  }
}

export class PersistenceResetInterruptedError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Persistence reset interrupted', { cause });
    this.name = 'PersistenceResetInterruptedError';
  }
}

interface AlphaResetJournal {
  phase: 'pending';
  version: 1;
}

interface DatabaseResetJournal {
  phase: 'pending';
  version: 1;
}

function parseAlphaResetJournal(value: unknown): AlphaResetJournal | null {
  if (!value || typeof value !== 'object') return null;
  return Reflect.get(value, 'version') === 1 && Reflect.get(value, 'phase') === 'pending'
    ? { phase: 'pending', version: 1 }
    : null;
}

function parseDatabaseResetJournal(value: unknown): DatabaseResetJournal | null {
  if (!value || typeof value !== 'object') return null;
  return Reflect.get(value, 'version') === 1 && Reflect.get(value, 'phase') === 'pending'
    ? { phase: 'pending', version: 1 }
    : null;
}

async function listDatabaseNames(): Promise<readonly string[] | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null;
  const databases = await indexedDB.databases();
  return databases.flatMap(({ name }) => (name ? [name] : []));
}

function deleteDatabaseByName(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB deletion failed'));
    request.onblocked = () =>
      reject(
        new DatabaseAdmissionError({
          databaseVersion: null,
          reason: 'connection-blocked',
          status: 'blocked',
        })
      );
    request.onsuccess = () => resolve();
  });
}

async function readAlphaResetJournal(): Promise<AlphaResetJournal | null> {
  if (!privacyErasureBrowserStorage.local.isAvailable()) return null;
  const values = await privacyErasureBrowserStorage.local.get(ALPHA_RESET_JOURNAL_KEY);
  return parseAlphaResetJournal(values[ALPHA_RESET_JOURNAL_KEY]);
}

async function readDatabaseResetJournal(): Promise<DatabaseResetJournal | null> {
  if (!privacyErasureBrowserStorage.local.isAvailable()) return null;
  const values = await privacyErasureBrowserStorage.local.get(DATABASE_RESET_JOURNAL_KEY);
  return parseDatabaseResetJournal(values[DATABASE_RESET_JOURNAL_KEY]);
}

async function hasPendingAlphaReset(databaseNames: readonly string[] | null): Promise<boolean> {
  if (await readAlphaResetJournal()) return true;
  const canonicalExists = databaseNames?.includes(DB_NAME) ?? false;
  const alphaExists =
    databaseNames?.some((name) =>
      LEGACY_ALPHA_DB_NAMES.includes(name as (typeof LEGACY_ALPHA_DB_NAMES)[number])
    ) ?? false;
  return alphaExists && !canonicalExists;
}

export async function runAlphaPersistenceReset(): Promise<void> {
  if (!privacyErasureBrowserStorage.local.isAvailable()) {
    throw new DatabaseAdmissionError({
      databaseVersion: null,
      reason: 'connection-blocked',
      status: 'blocked',
    });
  }
  await privacyErasureBrowserStorage.local.set({
    [ALPHA_RESET_JOURNAL_KEY]: { phase: 'pending', version: 1 } satisfies AlphaResetJournal,
  });
  try {
    for (const name of LEGACY_ALPHA_DB_NAMES) await deleteDatabaseByName(name);
    await eraseAssetStorage();
    await eraseVideoPreviewCacheForPrivacyErasure();
    const names = await listDatabaseNames();
    const legacyDatabaseRemains = names?.some((name) =>
      LEGACY_ALPHA_DB_NAMES.includes(name as (typeof LEGACY_ALPHA_DB_NAMES)[number])
    );
    const [assetRootCount, previewCacheAbsent] = await Promise.all([
      countAssetStorageRoots(),
      verifyVideoPreviewCacheEmptyAfterPrivacyErasure(),
    ]);
    if (legacyDatabaseRemains || assetRootCount !== 0 || !previewCacheAbsent) {
      throw new Error('Alpha persistence reset verification failed');
    }
    await privacyErasureBrowserStorage.local.remove(ALPHA_RESET_JOURNAL_KEY);
  } catch (error) {
    throw new PersistenceResetInterruptedError(error);
  }
}

async function eraseOwnedPersistenceAndVerify(): Promise<void> {
  for (const name of [DB_NAME, ...LEGACY_ALPHA_DB_NAMES]) await deleteDatabaseByName(name);
  await eraseAssetStorage();
  await eraseVideoPreviewCacheForPrivacyErasure();
  const names = await listDatabaseNames();
  const ownedNames = new Set<string>([DB_NAME, ...LEGACY_ALPHA_DB_NAMES]);
  const ownedDatabaseRemains = names?.some((name) => ownedNames.has(name));
  const [assetRootCount, previewCacheAbsent] = await Promise.all([
    countAssetStorageRoots(),
    verifyVideoPreviewCacheEmptyAfterPrivacyErasure(),
  ]);
  if (names === null || ownedDatabaseRemains || assetRootCount !== 0 || !previewCacheAbsent) {
    throw new Error('Persistence reset verification failed');
  }
}

export async function runRecoveryPersistenceReset(): Promise<void> {
  if (!privacyErasureBrowserStorage.local.isAvailable()) {
    throw new DatabaseAdmissionError({
      databaseVersion: null,
      reason: 'connection-blocked',
      status: 'blocked',
    });
  }
  await privacyErasureBrowserStorage.local.set({
    [DATABASE_RESET_JOURNAL_KEY]: { phase: 'pending', version: 1 } satisfies DatabaseResetJournal,
  });
  await eraseOwnedPersistenceAndVerify();
  await privacyErasureBrowserStorage.local.remove([
    ALPHA_RESET_JOURNAL_KEY,
    DATABASE_BACKUP_RECEIPT_KEY,
    DATABASE_RESET_JOURNAL_KEY,
  ]);
}

function getMissingStores(db: IDBPDatabase): string[] {
  const available = new Set(Array.from(db.objectStoreNames));
  const missing = EXPECTED_STORES.filter((storeName) => !available.has(storeName));
  return available.size === EXPECTED_STORES.length ? missing : [...missing, '<unexpected-store>'];
}

function getMissingIndexes(db: IDBPDatabase): string[] {
  const missing: string[] = [];
  for (const [storeName, indexes] of Object.entries(EXPECTED_INDEXES)) {
    if (!db.objectStoreNames.contains(storeName)) continue;
    const available = new Set(Array.from(db.transaction(storeName).store.indexNames));
    for (const index of indexes) if (!available.has(index)) missing.push(`${storeName}.${index}`);
    if (available.size !== indexes.length) missing.push(`${storeName}.<unexpected-index>`);
  }
  return missing;
}

async function inspectCurrentDatabase(db: IDBPDatabase): Promise<DatabaseAdmissionStatus> {
  const missingStores = getMissingStores(db);
  if (missingStores.length > 0) {
    return { databaseVersion: db.version, reason: 'stores', status: 'corrupt' };
  }
  const missingIndexes = getMissingIndexes(db);
  if (missingIndexes.length > 0) {
    return { databaseVersion: db.version, reason: 'indexes', status: 'corrupt' };
  }
  const contracts = await db.getAll(SCHEMA_CONTRACTS_STORE);
  if (!parseStoredSchemaContracts(contracts)) {
    return { databaseVersion: db.version, reason: 'domain-contracts', status: 'corrupt' };
  }
  return { databaseVersion: db.version, status: 'ready' };
}

export async function evaluateDatabaseMigrationPlan(
  databaseVersion: number,
  plan: readonly DatabaseMigrationDescriptor[]
): Promise<DatabaseAdmissionStatus> {
  const destructive = plan.some((migration) => migration.risk === 'destructive');
  if (destructive) {
    return {
      databaseVersion,
      reason: 'destructive-migration',
      status: 'backup-required',
      targetDatabaseVersion: DB_VERSION,
    };
  }
  let estimates: readonly number[];
  try {
    estimates = await Promise.all(plan.map((step) => step.estimateAdditionalBytes()));
  } catch {
    return {
      databaseVersion,
      reason: 'migration-path-missing',
      status: 'unsupported-version',
      targetDatabaseVersion: DB_VERSION,
    };
  }
  if (estimates.some((bytes) => !Number.isFinite(bytes) || bytes < 0)) {
    return {
      databaseVersion,
      reason: 'migration-path-missing',
      status: 'unsupported-version',
      targetDatabaseVersion: DB_VERSION,
    };
  }
  const requiredBytes = estimates.reduce((total, bytes) => total + bytes, 0);
  if (!Number.isSafeInteger(requiredBytes)) {
    return {
      databaseVersion,
      reason: 'migration-path-missing',
      status: 'unsupported-version',
      targetDatabaseVersion: DB_VERSION,
    };
  }
  if (requiredBytes > 0) {
    let estimate: StorageEstimate | undefined;
    try {
      estimate = await navigator.storage?.estimate?.();
    } catch {
      estimate = undefined;
    }
    const availableBytes =
      estimate?.quota === undefined || estimate.usage === undefined
        ? 0
        : Math.max(0, estimate.quota - estimate.usage);
    if (availableBytes < requiredBytes) {
      return {
        availableBytes,
        databaseVersion,
        requiredBytes,
        status: 'insufficient-space',
        targetDatabaseVersion: DB_VERSION,
      };
    }
  }
  return { databaseVersion: DB_VERSION, status: 'ready' };
}

async function inspectDatabaseIdentity(
  names: readonly string[] | null
): Promise<DatabaseAdmissionStatus | null> {
  if (await readDatabaseResetJournal()) {
    return {
      databaseVersion: null,
      reason: 'recovery-reset-required',
      status: 'blocked',
    };
  }
  if (await hasPendingAlphaReset(names)) {
    return {
      databaseVersion: null,
      reason: 'alpha-reset-required',
      status: 'blocked',
    };
  }
  if (
    names?.includes(DB_NAME) &&
    names.some((name) =>
      LEGACY_ALPHA_DB_NAMES.includes(name as (typeof LEGACY_ALPHA_DB_NAMES)[number])
    )
  ) {
    return {
      databaseVersion: null,
      reason: 'legacy-alpha-collision',
      status: 'corrupt',
    };
  }
  if (names && !names.includes(DB_NAME)) return { databaseVersion: DB_VERSION, status: 'ready' };
  if (!names) {
    return typeof indexedDB === 'undefined'
      ? { databaseVersion: DB_VERSION, status: 'ready' }
      : { databaseVersion: null, reason: 'connection-blocked', status: 'blocked' };
  }
  return null;
}

async function inspectOpenedDatabase(db: IDBPDatabase): Promise<DatabaseAdmissionStatus> {
  if (db.version > DB_VERSION) {
    return {
      databaseVersion: db.version,
      reason: 'future-version',
      status: 'unsupported-version',
      targetDatabaseVersion: DB_VERSION,
    };
  }
  if (db.version < DB_VERSION) {
    const sourceAdmission = await inspectSupportedSourceDatabase(db);
    if (!sourceAdmission || sourceAdmission.status !== 'ready') {
      return (
        sourceAdmission ?? {
          databaseVersion: db.version,
          reason: 'migration-path-missing',
          status: 'unsupported-version',
          targetDatabaseVersion: DB_VERSION,
        }
      );
    }
    const plan = buildDatabaseMigrationPlan(db.version, DB_VERSION);
    return plan
      ? await evaluateDatabaseMigrationPlan(db.version, plan)
      : {
          databaseVersion: db.version,
          reason: 'migration-path-missing',
          status: 'unsupported-version',
          targetDatabaseVersion: DB_VERSION,
        };
  }
  return inspectCurrentDatabase(db);
}

export async function inspectDatabaseAdmission(): Promise<DatabaseAdmissionStatus> {
  const identityAdmission = await inspectDatabaseIdentity(await listDatabaseNames());
  if (identityAdmission) return identityAdmission;
  let db: IDBPDatabase | null = null;
  try {
    db = await openDB(DB_NAME);
    return inspectOpenedDatabase(db);
  } finally {
    db?.close();
  }
}
