const localLocks = new Map<string, Promise<void>>();

function lockName(assetId: string): string {
  return `sniptale:voiceover-publication:${assetId}`;
}

function browserLocks(): LockManager | null {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks;
  if (typeof chrome !== 'undefined') throw new Error('Voiceover publication requires Web Locks.');
  return null;
}

async function withLocalLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const previous = localLocks.get(name) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => held);
  localLocks.set(name, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (localLocks.get(name) === tail) localLocks.delete(name);
  }
}

/** Keeps recovery from deleting a take while its review attachment is in flight. */
export async function withVoiceoverAttachmentLock<T>(
  assetId: string,
  operation: () => Promise<T>
): Promise<T> {
  const name = lockName(assetId);
  const locks = browserLocks();
  return locks
    ? locks.request(name, { mode: 'exclusive' }, operation)
    : withLocalLock(name, operation);
}

/** Recovery must never wait for a lock while it owns the asset lifecycle lock. */
export async function tryVoiceoverAttachmentLock<T>(
  assetId: string,
  operation: () => Promise<T>
): Promise<T | 'defer'> {
  const name = lockName(assetId);
  const locks = browserLocks();
  if (locks) {
    return locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) =>
      lock ? operation() : 'defer'
    );
  }
  return localLocks.has(name) ? 'defer' : withLocalLock(name, operation);
}
