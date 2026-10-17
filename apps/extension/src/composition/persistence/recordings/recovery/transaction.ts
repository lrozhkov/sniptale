import type { initDB, IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';

type Database = Awaited<ReturnType<typeof initDB>>;

/** Refuse acknowledgment when the browser does not support strict durability. */
export function createStrictRecordingTransaction(
  db: Database,
  stores: string | string[]
): IndexedDbWriteTransaction {
  const tx = db.transaction(typeof stores === 'string' ? [stores] : stores, 'readwrite', {
    durability: 'strict',
  });
  if (tx.durability !== 'strict') {
    tx.abort();
    void tx.done.catch(() => undefined);
    throw new Error('Strict recording storage durability is unavailable.');
  }
  return tx;
}
