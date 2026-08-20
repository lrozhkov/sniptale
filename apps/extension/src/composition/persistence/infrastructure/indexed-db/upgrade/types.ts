type UpgradeStoreSchema = {
  createIndex: (name: string, keyPath: string | string[]) => unknown;
};

export type UpgradeObjectStore = {
  clear(): Promise<unknown>;
  delete(key: IDBValidKey): Promise<unknown>;
  getAll(): Promise<unknown[]>;
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
