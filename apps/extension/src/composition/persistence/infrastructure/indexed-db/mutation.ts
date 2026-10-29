import {
  runWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../mutation-barrier';
import { initDB } from './core';

type SniptaleDatabase = Awaited<ReturnType<typeof initDB>>;

export function runWithIndexedDbMutation<T>(
  operation: (db: SniptaleDatabase, permit: PersistenceMutationPermit) => T | Promise<T>
): Promise<T> {
  return initDB().then((db) => runWithPersistenceMutationPermit((permit) => operation(db, permit)));
}
