const RESOURCE_GATE = 'sniptale:assets:resource-readers';

/** Disposable readers protect source bindings as well as bytes until their lifetime drains. */
export interface AssetResourceSession {
  release(): Promise<void>;
}

function resourceLocks(): LockManager | null {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks) return locks;
  if (typeof chrome !== 'undefined') throw new Error('Asset resource coordination is unavailable.');
  return null;
}

/** Acquire before reading durable state; native page termination releases its shared lease. */
export async function acquireAssetResourceSession(): Promise<AssetResourceSession> {
  const locks = resourceLocks();
  if (!locks) return { release: async () => undefined };
  let release!: () => void;
  let acquired!: () => void;
  let rejected!: (error: unknown) => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve, reject) => {
    acquired = resolve;
    rejected = reject;
  });
  const lifetime = locks.request(RESOURCE_GATE, { mode: 'shared' }, async () => {
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

/** Export and backup hold a reader through their complete asynchronous write/abort. */
export function runWithAssetResourceRead<T>(operation: () => Promise<T>): Promise<T> {
  const locks = resourceLocks();
  return locks ? locks.request(RESOURCE_GATE, { mode: 'shared' }, operation) : operation();
}

/** Causal maintenance never waits for readers and fails closed without native coordination. */
export async function tryAssetResourceCleanup<T>(
  operation: () => Promise<T>
): Promise<T | undefined> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return typeof chrome === 'undefined' ? operation() : undefined;
  return locks.request(RESOURCE_GATE, { mode: 'exclusive', ifAvailable: true }, (lock) =>
    lock ? operation() : undefined
  );
}
