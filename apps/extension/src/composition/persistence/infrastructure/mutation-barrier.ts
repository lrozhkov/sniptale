// policyStateId: persistent-data-erasure-lease

const PERSISTENCE_LOCK_NAME = 'sniptale:persistence:privacy-erasure';
const PERSISTENCE_TRANSITION_LOCK_NAME = `${PERSISTENCE_LOCK_NAME}:transition`;

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
  return runWithPersistenceLock('shared', () => runWithActiveMutationPermit(operation));
}

/**
 * Reserves the complete persistent mutation authority for an atomic cross-domain workflow.
 * The transition lease keeps privacy erasure ordered outside the workflow while the active
 * permit lets owner-prepared writes and compensating rollback use the guarded storage adapter.
 */
export function runWithExclusivePersistenceMutationPermit<T>(
  operation: (permit: PersistenceMutationPermit) => T | Promise<T>
): Promise<T> {
  return getPersistenceLockManager().request(
    PERSISTENCE_TRANSITION_LOCK_NAME,
    { mode: 'shared' },
    () => runWithPersistenceLock('exclusive', () => runWithActiveMutationPermit(operation))
  );
}

/**
 * Keeps a cross-context persistence workflow admitted while its individual writes use the
 * canonical mutation permit. Privacy erasure reserves this gate before the write barrier, so a
 * continuation cannot survive an MV3 worker restart and publish data after verified erasure.
 */
export function runWithPersistenceMutationTransition<T>(
  operation: () => T | Promise<T>
): Promise<T> {
  return getPersistenceLockManager().request(
    PERSISTENCE_TRANSITION_LOCK_NAME,
    { mode: 'shared' },
    operation
  );
}

export function runWithPersistentDataErasureBarrier<T>(
  operation: () => T | Promise<T>
): Promise<T> {
  return getPersistenceLockManager().request(
    PERSISTENCE_TRANSITION_LOCK_NAME,
    { mode: 'exclusive' },
    () => runWithPersistenceLock('exclusive', operation)
  );
}

export type PersistenceMutationDomain =
  | 'annotation-template-tags'
  | 'callout-presets'
  | 'drawing-palette'
  | 'drawing-tool-preferences'
  | 'gradient-presets'
  | 'highlighter-settings'
  | 'popup-startup'
  | 'screenshot-setup'
  | 'step-badge-presets'
  | 'surface-style-presets'
  | 'video-settings';

export function runWithPersistenceDomainMutationLock<T>(
  domain: PersistenceMutationDomain,
  operation: (permit: PersistenceMutationPermit) => T | Promise<T>
): Promise<T> {
  return runWithPersistenceDomainMutationLocks([domain], operation);
}

export function runWithPersistenceDomainMutationLocks<T>(
  domains: readonly PersistenceMutationDomain[],
  operation: (permit: PersistenceMutationPermit) => T | Promise<T>
): Promise<T> {
  const orderedDomains = [...new Set(domains)].sort();
  return runWithPersistenceMutationPermit((permit) =>
    acquireDomainLocks(orderedDomains, 0, () => operation(permit))
  );
}

function acquireDomainLocks<T>(
  domains: readonly PersistenceMutationDomain[],
  index: number,
  operation: () => T | Promise<T>
): Promise<T> {
  const domain = domains[index];
  if (!domain) return Promise.resolve().then(operation);
  return getPersistenceLockManager().request(
    `${PERSISTENCE_LOCK_NAME}:${domain}`,
    { mode: 'exclusive' },
    () => acquireDomainLocks(domains, index + 1, operation)
  );
}

async function runWithActiveMutationPermit<T>(
  operation: (permit: PersistenceMutationPermit) => T | Promise<T>
): Promise<T> {
  const permit: PersistenceMutationPermit = { [persistenceMutationPermitBrand]: true };
  activePersistenceMutationPermits.add(permit);
  try {
    return await operation(permit);
  } finally {
    activePersistenceMutationPermits.delete(permit);
  }
}
