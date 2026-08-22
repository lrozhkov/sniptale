import { runWithPersistenceMutationPermit } from '../mutation-barrier';
import { initDB } from './core';

type SniptaleDatabase = Awaited<ReturnType<typeof initDB>>;

export function runWithIndexedDbMutation<T>(
  operation: (db: SniptaleDatabase) => T | Promise<T>
): Promise<T> {
  return initDB().then((db) => runWithPersistenceMutationPermit(() => operation(db)));
}
