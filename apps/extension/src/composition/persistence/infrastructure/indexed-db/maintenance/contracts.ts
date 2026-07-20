type MaintenanceCursor = {
  continue: () => Promise<MaintenanceCursor | null>;
  primaryKey?: IDBValidKey | undefined;
  value: unknown;
};

type MaintenanceObjectStore = {
  get?: ((key: IDBValidKey) => Promise<unknown>) | undefined;
  openCursor: () => Promise<MaintenanceCursor | null>;
  put?: ((value: unknown) => Promise<unknown>) | undefined;
};

type MaintenanceTransaction = {
  done: Promise<unknown>;
  objectStore: (name: string) => MaintenanceObjectStore;
};

export type MaintenanceDatabase = {
  transaction: (storeName: string, mode?: 'readonly' | 'readwrite') => MaintenanceTransaction;
};

export type MaintenanceCandidate = {
  key?: IDBValidKey | undefined;
  value: unknown;
};
