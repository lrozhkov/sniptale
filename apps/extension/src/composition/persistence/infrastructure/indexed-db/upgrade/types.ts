type UpgradeStoreSchema = {
  createIndex: (name: string, keyPath: string) => unknown;
};

export type UpgradeDatabase = {
  createObjectStore: (
    name: string,
    optionalParameters?: IDBObjectStoreParameters
  ) => UpgradeStoreSchema;
  deleteObjectStore: (name: string) => void;
  objectStoreNames: { contains: (name: string) => boolean };
};
