import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DATABASE = 'sniptale-event-history';
interface HistorySchema extends DBSchema {
  state: { key: string; value: unknown };
  active: { key: number; value: unknown };
  archives: { key: string; value: unknown };
  catalog: { key: string; value: unknown };
}
export interface EventHistoryDatabase {
  readState(): Promise<unknown>;
  readActive(): Promise<unknown[]>;
  list(): Promise<unknown[]>;
  readArchive(id: string): Promise<unknown>;
  commit(
    state: unknown,
    text: string,
    replaceActive: boolean,
    archive: { id: string; metadata: unknown; blob: Blob } | null,
    remove: string[]
  ): Promise<void>;
  erase(): Promise<void>;
  verifyEmpty(): Promise<boolean>;
}
/** Independent advisory history: never admits or scans the product/media database. */
export function createEventHistoryDatabase(): EventHistoryDatabase {
  async function connection<T>(
    create: boolean,
    work: (db: IDBPDatabase<HistorySchema>) => Promise<T>,
    absent: T
  ): Promise<T> {
    if (typeof indexedDB === 'undefined') throw new Error('Event history unavailable');
    if (!create && !(await indexedDB.databases()).some((entry) => entry.name === DATABASE))
      return absent;
    const db = await openDB<HistorySchema>(DATABASE, 1, {
      upgrade(db) {
        db.createObjectStore('state');
        db.createObjectStore('active', { autoIncrement: true });
        db.createObjectStore('archives');
        db.createObjectStore('catalog');
      },
    });
    try {
      return await work(db);
    } finally {
      db.close();
    }
  }
  return {
    readState: () => connection(false, (db) => db.get('state', 'active'), undefined),
    readActive: () => connection(false, (db) => db.getAll('active'), []),
    list: () => connection(false, (db) => db.getAll('catalog'), []),
    readArchive: (id) => connection(false, (db) => db.get('archives', id), undefined),
    commit: (state, text, replaceActive, archive, remove) =>
      connection(
        true,
        async (db) => {
          const tx = db.transaction(['state', 'active', 'archives', 'catalog'], 'readwrite');
          try {
            await tx.objectStore('state').put(state, 'active');
            if (replaceActive) await tx.objectStore('active').clear();
            if (text) await tx.objectStore('active').add(text);
            if (archive) {
              await tx.objectStore('archives').put(archive.blob, archive.id);
              await tx.objectStore('catalog').put(archive.metadata, archive.id);
            }
            for (const id of remove) {
              await tx.objectStore('archives').delete(id);
              await tx.objectStore('catalog').delete(id);
            }
            await tx.done;
          } catch (error) {
            try {
              tx.abort();
            } catch {
              /* Already aborted. */
            }
            await tx.done.catch(() => undefined);
            throw error;
          }
        },
        undefined
      ),
    erase: () =>
      connection(
        false,
        async (db) => {
          const tx = db.transaction(['state', 'active', 'archives', 'catalog'], 'readwrite');
          await Promise.all([
            tx.objectStore('state').clear(),
            tx.objectStore('active').clear(),
            tx.objectStore('archives').clear(),
            tx.objectStore('catalog').clear(),
          ]);
          await tx.done;
        },
        undefined
      ),
    verifyEmpty: () =>
      connection(
        false,
        async (db) => {
          const tx = db.transaction(['state', 'active', 'archives', 'catalog']);
          const counts = await Promise.all([
            tx.objectStore('state').count(),
            tx.objectStore('active').count(),
            tx.objectStore('archives').count(),
            tx.objectStore('catalog').count(),
          ]);
          await tx.done;
          return counts.every((count) => count === 0);
        },
        true
      ),
  };
}
