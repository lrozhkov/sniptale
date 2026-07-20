import { WEB_SNAPSHOTS_STORE } from '../core.stores.ts';

const WEB_SNAPSHOT_MAINTENANCE_LEASE_FIELD = '__sniptaleProvenanceMaintenanceLease';

type LeaseObjectStore = {
  get?: ((key: IDBValidKey) => Promise<unknown>) | undefined;
  put?: ((value: unknown) => Promise<unknown>) | undefined;
};
type LeaseTransaction = {
  done: Promise<unknown>;
  objectStore: (name: string) => LeaseObjectStore;
};
type LeaseDatabase = {
  transaction: (storeName: string, mode?: 'readonly' | 'readwrite') => LeaseTransaction;
};

export function createMaintenanceLeaseToken(): string {
  return `provenance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function leaseCurrentWebSnapshotRecord(
  db: LeaseDatabase,
  key: IDBValidKey,
  leaseToken: string
): Promise<Record<string, unknown> | null> {
  const tx = db.transaction(WEB_SNAPSHOTS_STORE, 'readwrite');
  const store = tx.objectStore(WEB_SNAPSHOTS_STORE);
  const currentValue = store.get ? await store.get(key) : null;
  if (!isWebSnapshotMaintenanceRecord(currentValue) || !store.put) {
    await tx.done;
    return null;
  }

  const leasedValue = {
    ...currentValue,
    [WEB_SNAPSHOT_MAINTENANCE_LEASE_FIELD]: leaseToken,
  };
  await store.put(leasedValue);
  await tx.done;
  return leasedValue;
}

export async function putLeasedWebSnapshotRecord(
  db: LeaseDatabase,
  key: IDBValidKey,
  leaseToken: string,
  nextValue: unknown
): Promise<void> {
  const tx = db.transaction(WEB_SNAPSHOTS_STORE, 'readwrite');
  const store = tx.objectStore(WEB_SNAPSHOTS_STORE);
  const currentValue = store.get ? await store.get(key) : null;
  if (
    !isRecord(currentValue) ||
    currentValue[WEB_SNAPSHOT_MAINTENANCE_LEASE_FIELD] !== leaseToken
  ) {
    await tx.done;
    return;
  }

  if (store.put) {
    await store.put(stripMaintenanceLease(isRecord(nextValue) ? nextValue : currentValue));
  }
  await tx.done;
}

function isWebSnapshotMaintenanceRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value['manifest'])) {
    return false;
  }

  const manifest = value['manifest'];
  return isRecord(manifest['source']);
}

function stripMaintenanceLease(value: Record<string, unknown>): Record<string, unknown> {
  const { [WEB_SNAPSHOT_MAINTENANCE_LEASE_FIELD]: _lease, ...rest } = value;
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
