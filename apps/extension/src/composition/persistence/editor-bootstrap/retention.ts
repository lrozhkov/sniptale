import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { createLogger } from '@sniptale/platform/observability/logger';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { cleanupRetainedBootstrapEntries } from './retention-cleanup';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { isExpiredBootstrapEntry, parseRetainedBootstrapEntry } from './retention-entry';
import type { EditorBootstrapPayload } from '../../../features/editor/contracts/bootstrap';

interface EditorBootstrapDatabase extends DBSchema {
  payloads: {
    key: string;
    value: unknown;
  };
}

const EDITOR_BOOTSTRAP_DB_NAME = 'sniptale-editor-bootstrap';
const EDITOR_BOOTSTRAP_STORE_NAME = 'payloads';
const logger = createLogger({ namespace: 'SharedEditorBootstrapRetention' });

let editorBootstrapDbPromise: Promise<IDBPDatabase<EditorBootstrapDatabase>> | null = null;

function getEditorBootstrapDb(): Promise<IDBPDatabase<EditorBootstrapDatabase>> {
  if (editorBootstrapDbPromise) {
    return editorBootstrapDbPromise;
  }

  editorBootstrapDbPromise = (async () => {
    let openedDb: IDBPDatabase<EditorBootstrapDatabase> | null = null;
    const db = await openDB<EditorBootstrapDatabase>(EDITOR_BOOTSTRAP_DB_NAME, 1, {
      blocking() {
        openedDb?.close();
        editorBootstrapDbPromise = null;
      },
      upgrade(upgradeDb) {
        if (!upgradeDb.objectStoreNames.contains(EDITOR_BOOTSTRAP_STORE_NAME)) {
          upgradeDb.createObjectStore(EDITOR_BOOTSTRAP_STORE_NAME, { keyPath: 'id' });
        }
      },
    });
    openedDb = db;
    return db;
  })();

  return editorBootstrapDbPromise;
}

export async function persistEditorBootstrapPayload(
  payload: EditorBootstrapPayload
): Promise<string> {
  if (!isImageDataUrl(payload.dataUrl)) {
    throw new Error('Invalid editor bootstrap image data');
  }

  const id = crypto.randomUUID();
  await runWithPersistenceMutationPermit(async () => {
    const db = await getEditorBootstrapDb();
    await cleanupRetainedBootstrapEntries(db, EDITOR_BOOTSTRAP_STORE_NAME);
    await db.put(EDITOR_BOOTSTRAP_STORE_NAME, {
      id,
      dataUrl: payload.dataUrl,
      document: payload.document ?? null,
      sourceFaviconUrl: payload.sourceFaviconUrl ?? null,
      url: payload.url ?? '',
      title: payload.title ?? '',
      createdAt: Date.now(),
    });
    await cleanupRetainedBootstrapEntries(db, EDITOR_BOOTSTRAP_STORE_NAME);
  });

  return id;
}

export async function consumePersistedEditorBootstrapPayload(
  bootstrapId: string
): Promise<EditorBootstrapPayload | null> {
  return runWithPersistenceMutationPermit(async () => {
    const db = await getEditorBootstrapDb();
    const rawEntry = await db.get(EDITOR_BOOTSTRAP_STORE_NAME, bootstrapId);
    const entry = parseRetainedBootstrapEntry(rawEntry, bootstrapId);

    if (rawEntry === undefined) {
      return null;
    }

    if (!entry) {
      logger.warn('Deleting invalid editor bootstrap payload from IndexedDB', { bootstrapId });
      await db.delete(EDITOR_BOOTSTRAP_STORE_NAME, bootstrapId);
      return null;
    }

    if (isExpiredBootstrapEntry(entry, Date.now())) {
      await db.delete(EDITOR_BOOTSTRAP_STORE_NAME, bootstrapId);
      return null;
    }

    await db.delete(EDITOR_BOOTSTRAP_STORE_NAME, bootstrapId);

    return {
      dataUrl: entry.dataUrl,
      ...(typeof entry.document === 'undefined' ? {} : { document: entry.document }),
      ...(typeof entry.sourceFaviconUrl === 'undefined'
        ? {}
        : { sourceFaviconUrl: entry.sourceFaviconUrl }),
      ...(typeof entry.url === 'undefined' ? {} : { url: entry.url }),
      ...(typeof entry.title === 'undefined' ? {} : { title: entry.title }),
    };
  });
}

function closeCachedEditorBootstrapDb(db: IDBPDatabase<EditorBootstrapDatabase>): void {
  db.close();
}

async function clearEditorBootstrapStore(): Promise<void> {
  const db = await getEditorBootstrapDb();
  await db.clear(EDITOR_BOOTSTRAP_STORE_NAME);
}

function deleteEditorBootstrapDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(EDITOR_BOOTSTRAP_DB_NAME);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to delete editor bootstrap retention database'));
    request.onblocked = () =>
      reject(new Error('Editor bootstrap retention database deletion was blocked'));
    request.onsuccess = () => resolve();
  });
}

export async function purgeExpiredEditorBootstrapRetentionData(now = Date.now()): Promise<number> {
  return runWithPersistenceMutationPermit(async () =>
    cleanupRetainedBootstrapEntries(await getEditorBootstrapDb(), EDITOR_BOOTSTRAP_STORE_NAME, now)
  );
}

export async function initializeEditorBootstrapRetention(): Promise<void> {
  await purgeExpiredEditorBootstrapRetentionData();
}

export async function eraseEditorBootstrapRetentionData(): Promise<void> {
  const cachedDbPromise = editorBootstrapDbPromise;
  editorBootstrapDbPromise = null;

  if (cachedDbPromise) {
    try {
      closeCachedEditorBootstrapDb(await cachedDbPromise);
    } catch (error) {
      logger.warn('Failed to close editor bootstrap retention database before erasure', { error });
    }
  }

  try {
    await deleteEditorBootstrapDatabase();
  } catch (error) {
    editorBootstrapDbPromise = null;
    if (typeof indexedDB !== 'undefined') {
      throw error;
    }
    await clearEditorBootstrapStore();
    editorBootstrapDbPromise = null;
  }
}

export async function verifyEditorBootstrapRetentionEmpty(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
      return false;
    }
    const databases = await indexedDB.databases();
    return databases.every((database) => database.name !== EDITOR_BOOTSTRAP_DB_NAME);
  } catch {
    return false;
  }
}
