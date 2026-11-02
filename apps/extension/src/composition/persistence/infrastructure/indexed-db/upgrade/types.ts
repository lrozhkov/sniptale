type UpgradeStoreSchema = {
  createIndex: (name: string, keyPath: string | string[], options?: IDBIndexParameters) => unknown;
  put(value: unknown): unknown;
};

interface UpgradeCursor {
  readonly value: unknown;
  update(value: unknown): Promise<unknown>;
  continue(): Promise<UpgradeCursor | null>;
}

type UpgradeObjectStore = {
  readonly indexNames?: { contains(name: string): boolean };
  openCursor?(): Promise<UpgradeCursor | null>;
  index?(name: string): { getAll(query: IDBValidKey): Promise<unknown[]> };
  createIndex?: (name: string, keyPath: string | string[], options?: IDBIndexParameters) => unknown;
  clear(): unknown;
  delete(key: IDBValidKey): unknown;
  getAll(): unknown;
  put(value: unknown): unknown;
};

export type UpgradeTransaction = {
  readonly done?: Promise<unknown>;
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
    store: {
      openCursor(): Promise<DatabaseMigrationCursor | null>;
      count?(query?: IDBValidKey | IDBKeyRange): Promise<number>;
      index?(name: string): { count?(query?: IDBValidKey | IDBKeyRange): Promise<number> };
    };
  };
}
interface DatabaseMigrationCursor {
  value: unknown;
  primaryKey: IDBValidKey;
  continue(): Promise<DatabaseMigrationCursor | null>;
}
