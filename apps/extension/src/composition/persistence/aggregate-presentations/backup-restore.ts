import type { AggregatePresentationEntry } from './contracts';

interface PutStore<T> {
  put(value: T): Promise<unknown>;
}

export async function putAggregatePresentationBackupRestore(args: {
  entry: AggregatePresentationEntry;
  store: PutStore<AggregatePresentationEntry>;
}): Promise<void> {
  await args.store.put(args.entry);
}
