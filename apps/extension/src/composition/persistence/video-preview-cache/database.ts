import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const VIDEO_PREVIEW_CACHE_DATABASE_NAME = 'sniptale-video-preview-cache';
const VIDEO_PREVIEW_CACHE_DATABASE_VERSION = 1;
const METADATA_STORE = 'metadata';
const RECORD_STORE = 'video-previews';

interface VideoPreviewCacheSchema extends DBSchema {
  metadata: {
    key: string;
    value: unknown;
  };
  'video-previews': {
    key: string;
    value: unknown;
  };
}

interface VideoPreviewCacheMetadataStore {
  get(key: string): Promise<unknown>;
}

interface VideoPreviewCacheRecordStore extends VideoPreviewCacheMetadataStore {
  getAll(): Promise<unknown[]>;
  getAllKeys(): Promise<string[]>;
}

export interface VideoPreviewCacheRecordEntry {
  key: string;
  value: unknown;
}

export interface VideoPreviewCacheReadTransaction {
  getMetadata(key: string): Promise<unknown>;
  getRecord(key: string): Promise<unknown>;
  listRecordEntries(): Promise<VideoPreviewCacheRecordEntry[]>;
}

export interface VideoPreviewCacheTransaction extends VideoPreviewCacheReadTransaction {
  deleteRecord(key: string): Promise<void>;
  putMetadata(key: string, value: unknown): Promise<void>;
  putRecord(key: string, value: unknown): Promise<void>;
}

export interface VideoPreviewCacheDatabasePort {
  close(): Promise<void>;
  deleteDatabase(): Promise<void>;
  mutateExisting<T>(
    operation: (transaction: VideoPreviewCacheTransaction) => Promise<T>
  ): Promise<T | null>;
  mutateOrCreate<T>(
    operation: (transaction: VideoPreviewCacheTransaction) => Promise<T>
  ): Promise<T>;
  readExisting<T>(
    operation: (transaction: VideoPreviewCacheReadTransaction) => Promise<T>
  ): Promise<T | null>;
  verifyAbsent(): Promise<boolean>;
}

function requireIndexedDb(): IDBFactory {
  if (typeof indexedDB === 'undefined') throw new Error('Video preview cache is unavailable');
  return indexedDB;
}

async function databaseExists(): Promise<boolean | null> {
  const factory = requireIndexedDb();
  if (typeof factory.databases !== 'function') return null;
  const databases = await factory.databases();
  return databases.some((database) => database.name === VIDEO_PREVIEW_CACHE_DATABASE_NAME);
}

function createReadTransaction(
  db: IDBPDatabase<VideoPreviewCacheSchema>
): VideoPreviewCacheReadTransaction {
  const transaction = db.transaction([METADATA_STORE, RECORD_STORE], 'readonly');
  const metadata = transaction.objectStore(METADATA_STORE);
  const records = transaction.objectStore(RECORD_STORE);
  return createReadTransactionPort(metadata, records);
}

function createReadTransactionPort(
  metadata: VideoPreviewCacheMetadataStore,
  records: VideoPreviewCacheRecordStore
): VideoPreviewCacheReadTransaction {
  return {
    getMetadata: (key) => metadata.get(key),
    getRecord: (key) => records.get(key),
    async listRecordEntries() {
      const [keys, values] = await Promise.all([records.getAllKeys(), records.getAll()]);
      return keys.map((key, index) => ({ key, value: values[index] }));
    },
  };
}

function createMutationTransaction(db: IDBPDatabase<VideoPreviewCacheSchema>): {
  done: Promise<unknown>;
  port: VideoPreviewCacheTransaction;
  abort(): void;
} {
  const transaction = db.transaction([METADATA_STORE, RECORD_STORE], 'readwrite');
  const metadata = transaction.objectStore(METADATA_STORE);
  const records = transaction.objectStore(RECORD_STORE);
  const readPort = createReadTransactionPort(metadata, records);
  return {
    abort: () => transaction.abort(),
    done: transaction.done,
    port: {
      ...readPort,
      deleteRecord: async (key) => void (await records.delete(key)),
      putMetadata: async (key, value) => void (await metadata.put(value, key)),
      putRecord: async (key, value) => void (await records.put(value, key)),
    },
  };
}

async function executeMutation<T>(
  db: IDBPDatabase<VideoPreviewCacheSchema>,
  operation: (transaction: VideoPreviewCacheTransaction) => Promise<T>
): Promise<T> {
  const transaction = createMutationTransaction(db);
  try {
    const result = await operation(transaction.port);
    await transaction.done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already be aborted by IndexedDB.
    }
    await transaction.done.catch(() => undefined);
    throw error;
  }
}

function requestDatabaseDeletion(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = requireIndexedDb().deleteDatabase(VIDEO_PREVIEW_CACHE_DATABASE_NAME);
    request.onerror = () =>
      reject(request.error ?? new Error('Video preview cache deletion failed'));
    request.onblocked = () => reject(new Error('Video preview cache deletion was blocked'));
    request.onsuccess = () => resolve();
  });
}

interface VideoPreviewCacheConnectionOwner {
  close(): Promise<void>;
  open(): Promise<IDBPDatabase<VideoPreviewCacheSchema>>;
  openExisting(): Promise<IDBPDatabase<VideoPreviewCacheSchema> | null>;
}

function startDatabaseOpen(onBlocking: () => void) {
  let openedDatabase: IDBPDatabase<VideoPreviewCacheSchema> | null = null;
  let blocked = false;
  let rejectBlocked!: (error: Error) => void;
  const blockedResult = new Promise<never>((_resolve, reject) => {
    rejectBlocked = reject;
  });
  const opening = openDB<VideoPreviewCacheSchema>(
    VIDEO_PREVIEW_CACHE_DATABASE_NAME,
    VIDEO_PREVIEW_CACHE_DATABASE_VERSION,
    {
      blocked() {
        blocked = true;
        rejectBlocked(new Error('Video preview cache database open was blocked'));
      },
      blocking() {
        openedDatabase?.close();
        onBlocking();
      },
      terminated() {
        onBlocking();
      },
      upgrade(database) {
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE);
        }
        if (!database.objectStoreNames.contains(RECORD_STORE)) {
          database.createObjectStore(RECORD_STORE);
        }
      },
    }
  ).then((database) => {
    if (blocked) {
      database.close();
      throw new Error('Video preview cache database open was blocked');
    }
    openedDatabase = database;
    return database;
  });
  return Promise.race([opening, blockedResult]);
}

function createConnectionOwner(): VideoPreviewCacheConnectionOwner {
  let connectionPromise: Promise<IDBPDatabase<VideoPreviewCacheSchema>> | null = null;

  function open(): Promise<IDBPDatabase<VideoPreviewCacheSchema>> {
    if (connectionPromise) return connectionPromise;
    let guardedOpening: Promise<IDBPDatabase<VideoPreviewCacheSchema>>;
    const opening = startDatabaseOpen(() => {
      if (connectionPromise === guardedOpening) connectionPromise = null;
    });
    guardedOpening = opening.catch((error) => {
      if (connectionPromise === guardedOpening) connectionPromise = null;
      throw error;
    });
    connectionPromise = guardedOpening;
    return guardedOpening;
  }

  async function openExisting() {
    if (connectionPromise) return connectionPromise;
    return (await databaseExists()) === true ? open() : null;
  }

  return {
    async close() {
      const current = connectionPromise;
      connectionPromise = null;
      const database = current ? await current.catch(() => null) : null;
      database?.close();
    },
    open,
    openExisting,
  };
}

export function createVideoPreviewCacheDatabase(): VideoPreviewCacheDatabasePort {
  const connection = createConnectionOwner();
  return {
    close: connection.close,
    deleteDatabase: requestDatabaseDeletion,
    async mutateExisting(operation) {
      const database = await connection.openExisting();
      return database ? executeMutation(database, operation) : null;
    },
    async mutateOrCreate(operation) {
      return executeMutation(await connection.open(), operation);
    },
    async readExisting(operation) {
      const database = await connection.openExisting();
      return database ? operation(createReadTransaction(database)) : null;
    },
    async verifyAbsent() {
      return (await databaseExists()) === false;
    },
  };
}

export const defaultVideoPreviewCacheDatabase = createVideoPreviewCacheDatabase();
