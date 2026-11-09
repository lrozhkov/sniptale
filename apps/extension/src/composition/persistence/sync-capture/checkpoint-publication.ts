const PUBLICATION_LOCK = 'sniptale:sync:checkpoint-publication';

/** A browser-owned edit lifetime; release follows the final local write acknowledgement. */
export interface SyncCheckpointEdit {
  release(): Promise<void>;
}

function publicationLocks(): LockManager | null {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks) return locks;
  return null;
}

/** Acquire before native writes, outside mutation permits; the browser releases terminated editors. */
export async function acquireSyncCheckpointEdit(): Promise<SyncCheckpointEdit> {
  const locks = publicationLocks();
  if (!locks) {
    if (typeof chrome !== 'undefined')
      throw new Error('Sync checkpoint publication coordination is unavailable.');
    return { release: async () => undefined };
  }
  let acquired!: () => void;
  let rejected!: (cause: unknown) => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve, reject) => {
    acquired = resolve;
    rejected = reject;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lifetime = locks.request(PUBLICATION_LOCK, { mode: 'shared' }, async () => {
    acquired();
    await held;
  });
  void lifetime.catch(rejected);
  await ready;
  return {
    release: async () => {
      release();
      await lifetime;
    },
  };
}

/** Exclude unfinished edits across the complete native checkpoint dependency transaction. */
export async function tryRunWithSyncCheckpointPublication<T>(
  operation: () => T | Promise<T>
): Promise<T | null> {
  const locks = publicationLocks();
  if (!locks) return typeof chrome === 'undefined' ? operation() : null;
  return locks.request(PUBLICATION_LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) =>
    lock ? operation() : null
  );
}
