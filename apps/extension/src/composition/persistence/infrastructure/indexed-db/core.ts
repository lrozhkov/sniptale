import { openDB, type IDBPDatabase } from 'idb';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createMemoryStateDomainAdapter } from '@sniptale/platform/data/state-manager/memory-adapter';
import { stateManager } from '../state-manager';
import {
  isActivePersistenceMutationPermit,
  runWithPersistentDataErasureBarrier,
  runWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../mutation-barrier';
import {
  DatabaseAdmissionError,
  PersistenceResetInterruptedError,
  inspectDatabaseAdmission,
  runAlphaPersistenceReset,
  runRecoveryPersistenceReset,
  type DatabaseAdmissionStatus,
} from './admission';
import { handleDatabaseUpgrade } from './upgrade/core.ts';
import { runProvenanceUrlMaintenance } from './maintenance/provenance';
import {
  DB_NAME,
  DB_VERSION,
  EXPECTED_INDEXES,
  EXPECTED_STORES,
  LEGACY_ALPHA_DB_NAMES,
} from './core.stores.ts';

export * from './core.stores.ts';

const logger = createLogger({ namespace: 'SharedDbCore' });

interface DbTerminationEvent {
  dbName: string;
  dbVersion: number;
}

type DbTerminationListener = (event: DbTerminationEvent) => void;

interface MissingStoreIndexes {
  storeName: string;
  indexNames: string[];
}

function createDbCoreState() {
  return {
    databaseReady: false,
    dbTerminationListeners: new Set<DbTerminationListener>(),
    preparationPromise: null as Promise<void> | null,
  };
}

const DB_CORE_STATE_DOMAIN = 'shared.db.core';
const DB_PROMISE_KEY = 'dbPromise';
const PERSISTENT_STORAGE_PROMISE_KEY = 'persistentStoragePromise';

stateManager.registerDomain(DB_CORE_STATE_DOMAIN, {
  adapter: createMemoryStateDomainAdapter(),
});

const defaultDbCoreState = createLazyDefaultOwner(createDbCoreState);

function getDbCoreState() {
  return defaultDbCoreState.getOwner();
}

function getMissingStores(db: IDBPDatabase) {
  const stores = Array.from(db.objectStoreNames);
  return EXPECTED_STORES.filter((storeName) => !stores.includes(storeName));
}

function hasExpectedStores(db: IDBPDatabase) {
  return getMissingStores(db).length === 0;
}

function getAvailableIndexNames(db: IDBPDatabase, storeName: string) {
  const tx = db.transaction(storeName, 'readonly');
  return Array.from(tx.objectStore(storeName).indexNames);
}

function getMissingIndexes(db: IDBPDatabase) {
  const missingIndexes: MissingStoreIndexes[] = [];

  for (const [storeName, expectedIndexNames] of Object.entries(EXPECTED_INDEXES)) {
    const availableIndexNames = getAvailableIndexNames(db, storeName);
    const missingStoreIndexes = expectedIndexNames.filter(
      (indexName) => !availableIndexNames.includes(indexName)
    );
    if (missingStoreIndexes.length > 0) {
      missingIndexes.push({ storeName, indexNames: missingStoreIndexes });
    }
  }

  return missingIndexes;
}

function hasExpectedIndexes(db: IDBPDatabase) {
  return getMissingIndexes(db).length === 0;
}

function createStoreMismatchError(db: IDBPDatabase) {
  const missingStores = getMissingStores(db);
  const availableStores = Array.from(db.objectStoreNames);

  logger.error('Database schema mismatch detected', {
    availableStores,
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    missingStores,
  });

  return new Error(
    `IndexedDB schema mismatch for ${DB_NAME}: missing stores ${missingStores.join(', ')}`
  );
}

function createIndexMismatchError(db: IDBPDatabase) {
  const missingIndexes = getMissingIndexes(db);
  const availableIndexes = Object.fromEntries(
    Array.from(db.objectStoreNames, (storeName) => [
      storeName,
      Array.from(getAvailableIndexNames(db, storeName)),
    ])
  );
  const missingIndexPaths = missingIndexes.flatMap(({ storeName, indexNames }) =>
    indexNames.map((indexName) => `${storeName}.${indexName}`)
  );

  logger.error('Database schema index mismatch detected', {
    availableIndexes,
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    missingIndexes,
  });

  return new Error(
    `IndexedDB schema mismatch for ${DB_NAME}: missing indexes ${missingIndexPaths.join(', ')}`
  );
}

function notifyDbTerminationListeners() {
  const state = getDbCoreState();
  const event: DbTerminationEvent = {
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
  };

  for (const listener of state.dbTerminationListeners) {
    try {
      listener(event);
    } catch (error) {
      logger.warn('Database termination listener threw', error);
    }
  }
}

export async function requestPersistentStorageGrant(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    return false;
  }

  return createPersistentStorageGrantPromise();
}

async function createPersistentStorageGrantPromise(): Promise<boolean> {
  const stored = await stateManager.read<Promise<boolean>>(
    DB_CORE_STATE_DOMAIN,
    PERSISTENT_STORAGE_PROMISE_KEY
  );
  if (stored) {
    return stored;
  }

  const persistentStoragePromise = navigator.storage.persist().catch(() => false);
  await stateManager.write(
    DB_CORE_STATE_DOMAIN,
    PERSISTENT_STORAGE_PROMISE_KEY,
    persistentStoragePromise
  );
  return persistentStoragePromise;
}

async function openStoresWithMaintenance(): Promise<IDBPDatabase> {
  await requestPersistentStorageGrant().catch(() => false);
  let openedDb: IDBPDatabase | null = null;
  let openingBlocked = false;
  let rejectBlocked!: (error: DatabaseAdmissionError) => void;
  const blockedResult = new Promise<never>((_resolve, reject) => {
    rejectBlocked = reject;
  });
  const opening = openDB(DB_NAME, DB_VERSION, {
    upgrade: handleDatabaseUpgrade,
    blocked() {
      openingBlocked = true;
      logger.warn('Database upgrade blocked by another tab');
      rejectBlocked(
        new DatabaseAdmissionError({
          databaseVersion: null,
          reason: 'connection-blocked',
          status: 'blocked',
        })
      );
    },
    blocking() {
      logger.warn('This tab is blocking a database upgrade');
      openedDb?.close();
      getDbCoreState().databaseReady = false;
      void stateManager.remove(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY);
    },
    terminated() {
      logger.error('Database connection terminated unexpectedly');
      getDbCoreState().databaseReady = false;
      void stateManager.remove(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY);
      notifyDbTerminationListeners();
    },
  }).then((db) => {
    if (openingBlocked) {
      db.close();
      throw new DatabaseAdmissionError({
        databaseVersion: null,
        reason: 'connection-blocked',
        status: 'blocked',
      });
    }
    return db;
  });
  const db = await Promise.race([opening, blockedResult]);
  openedDb = db;

  if (!hasExpectedStores(db)) {
    const error = createStoreMismatchError(db);
    db.close();
    throw error;
  }

  if (!hasExpectedIndexes(db)) {
    const error = createIndexMismatchError(db);
    db.close();
    throw error;
  }

  await runProvenanceUrlMaintenance(db).catch((error) => {
    logger.warn('Provenance URL maintenance failed', error);
  });
  return db;
}

export { requestPersistentStorageGrant as ensurePersistentStorage };

export function initDB(permit?: PersistenceMutationPermit): Promise<IDBPDatabase> {
  if (isActivePersistenceMutationPermit(permit)) {
    if (!getDbCoreState().databaseReady) {
      return Promise.reject(
        new DatabaseAdmissionError({
          databaseVersion: null,
          reason: 'connection-blocked',
          status: 'blocked',
        })
      );
    }
    return openDbAuthority();
  }
  return prepareDatabase().then(() =>
    runWithPersistenceMutationPermit((activePermit) => initDB(activePermit))
  );
}

export async function prepareDatabaseForRecovery(): Promise<DatabaseAdmissionStatus> {
  try {
    await prepareDatabase(true);
    return { databaseVersion: DB_VERSION, status: 'ready' };
  } catch (error) {
    if (error instanceof DatabaseAdmissionError) return error.admission;
    throw error;
  }
}

export { inspectDatabaseAdmission };

async function prepareDatabase(allowAlphaReset = false): Promise<void> {
  const state = getDbCoreState();
  if (state.databaseReady) return;
  if (state.preparationPromise) return state.preparationPromise;
  const preparation = runWithPersistentDataErasureBarrier(async () => {
    let admission = await inspectDatabaseAdmission();
    if (
      allowAlphaReset &&
      admission.status === 'blocked' &&
      (admission.reason === 'alpha-reset-required' ||
        admission.reason === 'recovery-reset-required')
    ) {
      await closeDbAuthority();
      if (admission.reason === 'alpha-reset-required') {
        try {
          await runAlphaPersistenceReset();
        } catch (error) {
          if (!(error instanceof PersistenceResetInterruptedError)) throw error;
          throw new DatabaseAdmissionError({
            databaseVersion: null,
            reason: 'recovery-reset-failed',
            status: 'blocked',
          });
        }
      } else {
        try {
          await runRecoveryPersistenceReset();
        } catch {
          throw new DatabaseAdmissionError({
            databaseVersion: null,
            reason: 'recovery-reset-failed',
            status: 'blocked',
          });
        }
      }
      admission = await inspectDatabaseAdmission();
    }
    if (admission.status !== 'ready') throw new DatabaseAdmissionError(admission);
    await openDbAuthority();
    const verified = await inspectDatabaseAdmission();
    if (verified.status !== 'ready') throw new DatabaseAdmissionError(verified);
    state.databaseReady = true;
  });
  state.preparationPromise = preparation;
  try {
    await preparation;
  } finally {
    if (state.preparationPromise === preparation) state.preparationPromise = null;
  }
}

function openDbAuthority() {
  return stateManager
    .mutate<Promise<IDBPDatabase>>(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY, (current) => {
      return current ?? createDbPromise();
    })
    .then(({ value }) => value as Promise<IDBPDatabase>);
}

function createDbPromise() {
  const dbPromise = openStoresWithMaintenance().catch((error) => {
    void stateManager.remove(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY);
    throw error;
  });
  return dbPromise;
}

function deleteDatabase(name: string) {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }

  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB deletion failed'));
    request.onblocked = () => reject(new Error('IndexedDB deletion was blocked'));
    request.onsuccess = () => resolve();
  });
}

async function closeDbAuthority(): Promise<void> {
  const state = getDbCoreState();
  state.databaseReady = false;
  const cachedDb = await stateManager.read<IDBPDatabase>(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY);
  await stateManager.remove(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY);
  cachedDb?.close();
}

export async function eraseSniptaleDatabaseForPrivacyErasure(): Promise<void> {
  await closeDbAuthority();
  for (const name of [DB_NAME, ...LEGACY_ALPHA_DB_NAMES]) await deleteDatabase(name);
}

export async function verifySniptaleDatabaseAbsentAfterPrivacyErasure(): Promise<boolean> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
    return false;
  }
  const ownedNames = new Set([DB_NAME, ...LEGACY_ALPHA_DB_NAMES]);
  return (await indexedDB.databases()).every(
    (database) => !database.name || !ownedNames.has(database.name)
  );
}

export async function resetDatabaseFromRecovery(): Promise<DatabaseAdmissionStatus> {
  await runWithPersistentDataErasureBarrier(async () => {
    await closeDbAuthority();
    await runRecoveryPersistenceReset();
  });
  return prepareDatabaseForRecovery();
}

export function subscribeToDbTermination(listener: DbTerminationListener): () => void {
  const state = getDbCoreState();
  state.dbTerminationListeners.add(listener);

  return () => {
    state.dbTerminationListeners.delete(listener);
  };
}
