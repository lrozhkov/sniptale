type UpgradeStoreSchema = {
  createIndex: (name: string, keyPath: string | string[]) => unknown;
  put(value: unknown): unknown;
};

type UpgradeObjectStore = {
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
