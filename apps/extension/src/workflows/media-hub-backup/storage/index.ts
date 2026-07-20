interface BackupObjectStore {
  delete: (key: IDBKeyRange | IDBValidKey) => Promise<unknown>;
  get: (key: IDBKeyRange | IDBValidKey) => Promise<unknown>;
  index: (name: string) => {
    getAll: (key?: IDBKeyRange | IDBValidKey | null) => Promise<unknown[]>;
  };
  put: (value: unknown) => Promise<unknown>;
}

type BackupTransaction = {
  objectStore: (name: string) => BackupObjectStore;
};

export function getStore(tx: BackupTransaction, storeName: string): BackupObjectStore {
  return tx.objectStore(storeName);
}
