// policyStateId: persistent-data-erasure-lease

const PERSISTENCE_LOCK_NAME = 'sniptale:persistence:privacy-erasure';
const PERSISTENCE_TRANSITION_LOCK_NAME = `${PERSISTENCE_LOCK_NAME}:transition`;
const DURABLE_ASSET_LIFECYCLE_LOCK_NAME = `${PERSISTENCE_LOCK_NAME}:durable-assets`;
const DURABLE_ASSET_OPERATION_LOCK_NAME = `${PERSISTENCE_LOCK_NAME}:durable-asset-operations`;

type PersistenceLockMode = 'exclusive' | 'shared';

const persistenceMutationPermitBrand = Symbol('persistenceMutationPermit');
const persistenceMutationTransitionPermitBrand = Symbol('persistenceMutationTransitionPermit');
const durableAssetOperationPermitBrand = Symbol('durableAssetOperationPermit');

export interface PersistenceMutationPermit {
  readonly [persistenceMutationPermitBrand]: true;
}

export interface DurableAssetOperationPermit {
  readonly [durableAssetOperationPermitBrand]: true;
}

export interface PersistenceMutationTransitionPermit {
  readonly [persistenceMutationTransitionPermitBrand]: true;
}

export function isActivePersistenceMutationTransitionPermit(
  value: unknown
): value is PersistenceMutationTransitionPermit {
  return (
    typeof value === 'object' &&
    value !== null &&
    activePersistenceMutationTransitionPermits.has(value)
  );
}

export interface PersistenceMutationTransitionLease {
  release(): Promise<void>;
}

export interface PersistenceLockManager {
  request<T>(
    name: string,
    options: { mode: PersistenceLockMode; ifAvailable?: boolean },
    operation: (lock?: unknown) => T | Promise<T>
  ): Promise<T>;
}

let lockManagerForTests: PersistenceLockManager | null = null;
const fallbackQueues = new Map<string, Promise<void>>();
const fallbackExclusiveRequests = new Map<string, number>();
const activePersistenceMutationPermits = new WeakSet<object>();
const activePersistenceMutationTransitionPermits = new WeakSet<object>();
const activeDurableAssetOperationPermits = new WeakSet<object>();
let heldPersistenceMutationTransitions = 0;

const fallbackLockManager: PersistenceLockManager = {
  request<T>(
    name: string,
    options: { mode: PersistenceLockMode; ifAvailable?: boolean },
    operation: (lock?: unknown) => T | Promise<T>
  ): Promise<T> {
    if (options.ifAvailable && fallbackExclusiveRequests.has(name))
      return Promise.resolve(operation(null));
    if (options.mode === 'exclusive')
      fallbackExclusiveRequests.set(name, (fallbackExclusiveRequests.get(name) ?? 0) + 1);
    const queue = fallbackQueues.get(name) ?? Promise.resolve();
    const execution = queue.then(operation);
    const settled = execution.then(
      () => undefined,
      () => undefined
    );
    fallbackQueues.set(name, settled);
    void settled.then(() => {
      if (options.mode === 'exclusive') {
        const remaining = (fallbackExclusiveRequests.get(name) ?? 1) - 1;
        if (remaining) fallbackExclusiveRequests.set(name, remaining);
        else fallbackExclusiveRequests.delete(name);
      }
      if (fallbackQueues.get(name) === settled) fallbackQueues.delete(name);
    });
    return execution;
  },
};

export function installPersistenceLockManagerForTests(
  lockManager: PersistenceLockManager | null
): void {
  lockManagerForTests = lockManager;
  if (lockManager === null) {
    fallbackQueues.clear();
    fallbackExclusiveRequests.clear();
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

/**
 * True while this context already holds the shared transition gate — a workflow
 * transition or a staged writer lease. Cold admission must fail before requesting the exclusive
 * gate in this state so the workflow can release its lease and retry.
 */
export function isPersistenceMutationTransitionHeld(): boolean {
  return heldPersistenceMutationTransitions > 0;
}

async function runWithHeldPersistenceMutationTransition<T>(
  operation: () => T | Promise<T>
): Promise<T> {
  heldPersistenceMutationTransitions += 1;
  try {
    return await operation();
  } finally {
    heldPersistenceMutationTransitions -= 1;
  }
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

/** Refuses rather than queues a page-local draft across an active privacy erasure. */
export function tryRunWithPersistenceMutationPermit<T>(
  operation: (permit: PersistenceMutationPermit) => T | Promise<T>
): Promise<T | null> {
  return getPersistenceLockManager().request(
    PERSISTENCE_LOCK_NAME,
    { mode: 'shared', ifAvailable: true },
    (lock) => (lock === null ? null : runWithActiveMutationPermit(operation))
  );
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
    () =>
      runWithHeldPersistenceMutationTransition(() =>
        runWithPersistenceLock('exclusive', () => runWithActiveMutationPermit(operation))
      )
  );
}

/**
 * Keeps a cross-context persistence workflow admitted while its individual writes use the
 * canonical mutation permit. Privacy erasure reserves this gate before the write barrier, so a
 * continuation cannot survive an MV3 worker restart and publish data after verified erasure.
 */
export function runWithPersistenceMutationTransition<T>(
  operation: (permit: PersistenceMutationTransitionPermit) => T | Promise<T>
): Promise<T> {
  return getPersistenceLockManager().request(
    PERSISTENCE_TRANSITION_LOCK_NAME,
    { mode: 'shared' },
    () =>
      runWithHeldPersistenceMutationTransition(async () => {
        const permit: PersistenceMutationTransitionPermit = {
          [persistenceMutationTransitionPermitBrand]: true,
        };
        activePersistenceMutationTransitionPermits.add(permit);
        try {
          return await operation(permit);
        } finally {
          activePersistenceMutationTransitionPermits.delete(permit);
        }
      })
  );
}

export function runWithPersistenceMutationTransitionRecovery<T>(
  permit: PersistenceMutationTransitionPermit | undefined,
  operation: () => T | Promise<T>
): Promise<T> {
  if (permit && activePersistenceMutationTransitionPermits.has(permit)) {
    return Promise.resolve().then(operation);
  }
  return runWithPersistenceMutationTransition(operation);
}

export async function acquirePersistenceMutationTransition(): Promise<PersistenceMutationTransitionLease> {
  let releaseTransition!: () => void;
  let resolveAcquired!: () => void;
  let rejectAcquired!: (error: unknown) => void;
  const released = new Promise<void>((resolve) => {
    releaseTransition = resolve;
  });
  const acquired = new Promise<void>((resolve, reject) => {
    resolveAcquired = resolve;
    rejectAcquired = reject;
  });
  const lifetime = getPersistenceLockManager().request(
    PERSISTENCE_TRANSITION_LOCK_NAME,
    { mode: 'shared' },
    () =>
      runWithHeldPersistenceMutationTransition(async () => {
        resolveAcquired();
        await released;
      })
  );
  void lifetime.catch(rejectAcquired);
  await acquired;
  let active = true;
  return {
    async release() {
      if (!active) return;
      active = false;
      releaseTransition();
      await lifetime;
    },
  };
}

export function runWithDurableAssetLifecycleLock<T>(operation: () => T | Promise<T>): Promise<T> {
  return getPersistenceLockManager().request(
    DURABLE_ASSET_LIFECYCLE_LOCK_NAME,
    { mode: 'exclusive' },
    operation
  );
}

export function runWithDurableAssetOperation<T>(
  operation: (permit: DurableAssetOperationPermit) => T | Promise<T>
): Promise<T> {
  return getPersistenceLockManager().request(
    DURABLE_ASSET_OPERATION_LOCK_NAME,
    { mode: 'exclusive' },
    async () => {
      const permit: DurableAssetOperationPermit = { [durableAssetOperationPermitBrand]: true };
      activeDurableAssetOperationPermits.add(permit);
      try {
        return await operation(permit);
      } finally {
        activeDurableAssetOperationPermits.delete(permit);
      }
    }
  );
}

export function runWithDurableAssetOperationRecovery<T>(
  permit: DurableAssetOperationPermit | undefined,
  operation: () => T | Promise<T>
): Promise<T> {
  if (permit && activeDurableAssetOperationPermits.has(permit)) {
    return Promise.resolve().then(operation);
  }
  return getPersistenceLockManager().request(
    DURABLE_ASSET_OPERATION_LOCK_NAME,
    { mode: 'exclusive' },
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
  | 'technical-data-preference'
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
