import { openDB, type IDBPDatabase } from 'idb';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createMemoryStateDomainAdapter } from '@sniptale/platform/data/state-manager/memory-adapter';
import { stateManager } from '../state-manager';
import {
  isActivePersistenceMutationPermit,
  runWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../mutation-barrier';
import { handleDatabaseUpgrade } from './upgrade/core.ts';
import { runProvenanceUrlMaintenance } from './maintenance/provenance';
import { DB_NAME, DB_VERSION, EXPECTED_INDEXES, EXPECTED_STORES } from './core.stores.ts';

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
    dbTerminationListeners: new Set<DbTerminationListener>(),
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
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade: handleDatabaseUpgrade,
    blocked() {
      logger.warn('Database upgrade blocked by another tab');
    },
    blocking() {
      logger.warn('This tab is blocking a database upgrade');
      openedDb?.close();
      void stateManager.remove(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY);
    },
    terminated() {
      logger.error('Database connection terminated unexpectedly');
      void stateManager.remove(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY);
      notifyDbTerminationListeners();
    },
  });
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

export function initDB(permit?: PersistenceMutationPermit) {
  if (isActivePersistenceMutationPermit(permit)) {
    return openDbAuthority();
  }
  return runWithPersistenceMutationPermit(() => openDbAuthority());
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

function deleteDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }

  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB deletion failed'));
    request.onblocked = () => reject(new Error('IndexedDB deletion was blocked'));
    request.onsuccess = () => resolve();
  });
}

export async function eraseSniptaleDatabaseForPrivacyErasure(): Promise<void> {
  const cachedDb = await stateManager.read<IDBPDatabase>(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY);
  await stateManager.remove(DB_CORE_STATE_DOMAIN, DB_PROMISE_KEY);
  cachedDb?.close();
  await deleteDatabase();
}

export async function verifySniptaleDatabaseAbsentAfterPrivacyErasure(): Promise<boolean> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
    return false;
  }
  return (await indexedDB.databases()).every((database) => database.name !== DB_NAME);
}

export function subscribeToDbTermination(listener: DbTerminationListener): () => void {
  const state = getDbCoreState();
  state.dbTerminationListeners.add(listener);

  return () => {
    state.dbTerminationListeners.delete(listener);
  };
}
