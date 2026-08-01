// policyStateId: persistent-data-erasure-lease
const PERSISTENCE_LOCK_NAME = 'sniptale:persistence:privacy-erasure';

type PersistenceLockMode = 'exclusive' | 'shared';

const persistenceMutationPermitBrand = Symbol('persistenceMutationPermit');

export interface PersistenceMutationPermit {
  readonly [persistenceMutationPermitBrand]: true;
}

export interface PersistenceLockManager {
  request<T>(
    name: string,
    options: { mode: PersistenceLockMode },
    operation: () => T | Promise<T>
  ): Promise<T>;
}

let lockManagerForTests: PersistenceLockManager | null = null;
const fallbackQueues = new Map<string, Promise<void>>();
const activePersistenceMutationPermits = new WeakSet<object>();

const fallbackLockManager: PersistenceLockManager = {
  request<T>(
    name: string,
    _options: { mode: PersistenceLockMode },
    operation: () => T | Promise<T>
  ): Promise<T> {
    const queue = fallbackQueues.get(name) ?? Promise.resolve();
    const execution = queue.then(operation);
    fallbackQueues.set(
      name,
      execution.then(
        () => undefined,
        () => undefined
      )
    );
    return execution;
  },
};

export function installPersistenceLockManagerForTests(
  lockManager: PersistenceLockManager | null
): void {
  lockManagerForTests = lockManager;
  if (lockManager === null) {
    fallbackQueues.clear();
  }
}

function getPersistenceLockManager(): PersistenceLockManager {
  if (lockManagerForTests) {
    return lockManagerForTests;
  }

  const lockManager = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (lockManager) {
    return lockManager as unknown as PersistenceLockManager;
  }

  if (typeof chrome !== 'undefined') {
    throw new Error('Persistent mutation coordination is unavailable');
  }
  return fallbackLockManager;
}

function runWithPersistenceLock<T>(
  mode: PersistenceLockMode,
  operation: () => T | Promise<T>
): Promise<T> {
  return getPersistenceLockManager().request(PERSISTENCE_LOCK_NAME, { mode }, operation);
}

export function isActivePersistenceMutationPermit(
  value: unknown
): value is PersistenceMutationPermit {
  return typeof value === 'object' && value !== null && activePersistenceMutationPermits.has(value);
}

export function runWithPersistenceMutationPermit<T>(
  operation: (permit: PersistenceMutationPermit) => T | Promise<T>
): Promise<T> {
  return runWithPersistenceLock('shared', async () => {
    const permit: PersistenceMutationPermit = { [persistenceMutationPermitBrand]: true };
    activePersistenceMutationPermits.add(permit);
    try {
      return await operation(permit);
    } finally {
      activePersistenceMutationPermits.delete(permit);
    }
  });
}

export function runWithPersistentDataErasureBarrier<T>(
  operation: () => T | Promise<T>
): Promise<T> {
  return runWithPersistenceLock('exclusive', operation);
}

export type PersistenceMutationDomain = 'highlighter-settings' | 'video-settings';

export function runWithPersistenceDomainMutationLock<T>(
  domain: PersistenceMutationDomain,
  operation: (permit: PersistenceMutationPermit) => T | Promise<T>
): Promise<T> {
  return runWithPersistenceMutationPermit((permit) =>
    getPersistenceLockManager().request(
      `${PERSISTENCE_LOCK_NAME}:${domain}`,
      { mode: 'exclusive' },
      () => operation(permit)
    )
  );
}
