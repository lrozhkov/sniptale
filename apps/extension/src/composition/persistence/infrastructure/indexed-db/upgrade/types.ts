type UpgradeStoreSchema = {
  createIndex: (name: string, keyPath: string | string[], options?: IDBIndexParameters) => unknown;
  put(value: unknown): unknown;
};

type UpgradeObjectStore = {
  createIndex?: (name: string, keyPath: string | string[], options?: IDBIndexParameters) => unknown;
  clear(): unknown;
  delete(key: IDBValidKey): unknown;
  getAll(): unknown;
  put(value: unknown): unknown;
};

export type UpgradeTransaction = {
  abort(): void;
  objectStore(name: string): UpgradeObjectStore;
};

export type UpgradeDatabase = {
  createObjectStore: (
    name: string,
    optionalParameters?: IDBObjectStoreParameters
  ) => UpgradeStoreSchema;
  deleteObjectStore: (name: string) => void;
  objectStoreNames: { contains: (name: string) => boolean };
};

/** Read-only source capability supplied by admission during migration quota estimation. */
export interface DatabaseMigrationSource {
  transaction(
    name: string,
    mode: 'readonly'
  ): {
    store: { openCursor(): Promise<DatabaseMigrationCursor | null> };
  };
}
interface DatabaseMigrationCursor {
  value: unknown;
  primaryKey: IDBValidKey;
  continue(): Promise<DatabaseMigrationCursor | null>;
}
