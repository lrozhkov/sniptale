/** Serialize final request admission and native lifecycle transitions, never response IO. */
export function withSyncConnectionAdmissionLock<T>(operation: () => T | Promise<T>): Promise<T> {
  return navigator.locks.request(
    'sniptale.sync-connection.admission',
    { mode: 'exclusive' },
    operation
  );
}
