import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  acquirePersistenceMutationTransition,
  isActivePersistenceMutationPermit,
  installPersistenceLockManagerForTests,
  runWithDurableAssetLifecycleLock,
  runWithDurableAssetOperation,
  runWithDurableAssetOperationRecovery,
  runWithPersistenceMutationPermit,
  runWithPersistenceMutationTransition,
  runWithPersistenceMutationTransitionRecovery,
  runWithExclusivePersistenceMutationPermit,
  runWithPersistenceDomainMutationLock,
  runWithPersistenceDomainMutationLocks,
  runWithPersistentDataErasureBarrier,
  type DurableAssetOperationPermit,
  type PersistenceLockManager,
  type PersistenceMutationTransitionPermit,
} from './mutation-barrier';

interface PendingLock {
  mode: 'exclusive' | 'shared';
  operation: () => unknown | Promise<unknown>;
  reject(error: unknown): void;
  resolve(value: unknown): void;
}

interface LockState {
  activeExclusive: boolean;
  activeShared: number;
  pending: PendingLock[];
}

async function runPendingLock(lock: PendingLock): Promise<void> {
  try {
    lock.resolve(await lock.operation());
  } catch (error) {
    lock.reject(error);
  }
}

function createLockManager(): PersistenceLockManager {
  const locks = new Map<string, LockState>();

  function getLockState(name: string): LockState {
    const existing = locks.get(name);
    if (existing) return existing;
    const state = { activeExclusive: false, activeShared: 0, pending: [] };
    locks.set(name, state);
    return state;
  }

  function drain(name: string): void {
    const state = getLockState(name);
    if (state.activeExclusive || state.pending.length === 0) return;
    const first = state.pending[0]!;
    if (first.mode === 'exclusive') {
      if (state.activeShared > 0) return;
      state.pending.shift();
      state.activeExclusive = true;
      void runPendingLock(first).finally(() => {
        state.activeExclusive = false;
        drain(name);
      });
      return;
    }

    while (state.pending[0]?.mode === 'shared' && !state.activeExclusive) {
      const next = state.pending.shift()!;
      state.activeShared += 1;
      void runPendingLock(next).finally(() => {
        state.activeShared -= 1;
        drain(name);
      });
    }
  }

  return {
    request<T>(
      name: string,
      options: { mode: 'exclusive' | 'shared' },
      operation: () => T | Promise<T>
    ) {
      return new Promise<T>((resolve, reject) => {
        getLockState(name).pending.push({
          mode: options.mode,
          operation,
          reject,
          resolve: resolve as (value: unknown) => void,
        });
        drain(name);
      });
    },
  };
}

beforeEach(() => {
  installPersistenceLockManagerForTests(createLockManager());
});

afterEach(() => {
  installPersistenceLockManagerForTests(null);
});

it('keeps a live mutation admitted until completion and queues erasure plus later mutations', async () => {
  let releaseMutation!: () => void;
  const mutationGate = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });
  const admittedOperation = vi.fn(async () => mutationGate);
  const erasureOperation = vi.fn(async () => undefined);
  const lateOperation = vi.fn(async () => undefined);

  const admitted = runWithPersistenceMutationPermit(admittedOperation);
  await vi.waitFor(() => expect(admittedOperation).toHaveBeenCalledOnce());
  const erasure = runWithPersistentDataErasureBarrier(erasureOperation);
  const late = runWithPersistenceMutationPermit(lateOperation);
  await Promise.resolve();
  expect(erasureOperation).not.toHaveBeenCalled();
  expect(lateOperation).not.toHaveBeenCalled();

  releaseMutation();
  await admitted;
  await erasure;
  await late;
  expect(erasureOperation).toHaveBeenCalledOnce();
  expect(lateOperation).toHaveBeenCalledOnce();
  expect(erasureOperation.mock.invocationCallOrder[0]).toBeLessThan(
    lateOperation.mock.invocationCallOrder[0]!
  );
});

it('keeps a cross-context transition ahead of erasure across worker-local state loss', async () => {
  let releaseTransition!: () => void;
  const transitionGate = new Promise<void>((resolve) => {
    releaseTransition = resolve;
  });
  const admittedContinuation = vi.fn(async () => transitionGate);
  const erasureOperation = vi.fn(async () => undefined);

  const transition = runWithPersistenceMutationTransition(admittedContinuation);
  await vi.waitFor(() => expect(admittedContinuation).toHaveBeenCalledOnce());
  const erasure = runWithPersistentDataErasureBarrier(erasureOperation);
  await Promise.resolve();
  expect(erasureOperation).not.toHaveBeenCalled();

  releaseTransition();
  await transition;
  await erasure;
  expect(erasureOperation).toHaveBeenCalledOnce();
});

it('keeps an explicitly acquired publication transition ahead of erasure until release', async () => {
  const lease = await acquirePersistenceMutationTransition();
  const erasureOperation = vi.fn(async () => undefined);

  const erasure = runWithPersistentDataErasureBarrier(erasureOperation);
  await Promise.resolve();
  expect(erasureOperation).not.toHaveBeenCalled();

  await lease.release();
  await erasure;
  expect(erasureOperation).toHaveBeenCalledOnce();
  await expect(lease.release()).resolves.toBeUndefined();
});

it('queues startup recovery until a live durable restore operation completes', async () => {
  let releaseRestore!: () => void;
  const restoreGate = new Promise<void>((resolve) => {
    releaseRestore = resolve;
  });
  const liveRestore = vi.fn(async () => restoreGate);
  const startupRecovery = vi.fn(async () => undefined);

  const restore = runWithDurableAssetOperation(liveRestore);
  await vi.waitFor(() => expect(liveRestore).toHaveBeenCalledOnce());
  const recovery = runWithDurableAssetOperationRecovery(undefined, startupRecovery);
  await Promise.resolve();
  expect(startupRecovery).not.toHaveBeenCalled();

  releaseRestore();
  await restore;
  await recovery;
  expect(startupRecovery).toHaveBeenCalledOnce();
});

it('serializes live durable restores so one restore cannot recover another', async () => {
  let releaseFirstRestore!: () => void;
  const firstRestoreGate = new Promise<void>((resolve) => {
    releaseFirstRestore = resolve;
  });
  const firstRestore = vi.fn(async () => firstRestoreGate);
  const secondRestore = vi.fn(async () => undefined);

  const first = runWithDurableAssetOperation(firstRestore);
  await vi.waitFor(() => expect(firstRestore).toHaveBeenCalledOnce());
  const second = runWithDurableAssetOperation(secondRestore);
  await Promise.resolve();
  expect(secondRestore).not.toHaveBeenCalled();

  releaseFirstRestore();
  await first;
  await second;
  expect(secondRestore).toHaveBeenCalledOnce();
});

it('lets an admitted restore invoke its own recovery without reacquiring the operation lock', async () => {
  const nestedRecovery = vi.fn(async () => 'recovered');

  await expect(
    runWithDurableAssetOperation((permit) =>
      runWithDurableAssetOperationRecovery(permit, nestedRecovery)
    )
  ).resolves.toBe('recovered');
  expect(nestedRecovery).toHaveBeenCalledOnce();
});

it('issues an unforgeable permit only for the lifetime of its admitted operation', async () => {
  let issuedPermit: unknown;

  await runWithPersistenceMutationPermit(async (permit) => {
    issuedPermit = permit;
    expect(isActivePersistenceMutationPermit(permit)).toBe(true);
    expect(isActivePersistenceMutationPermit({})).toBe(false);
  });

  expect(isActivePersistenceMutationPermit(issuedPermit)).toBe(false);
});

it('serializes concurrent erasures without overwriting active ownership', async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstOperation = vi.fn(async () => firstGate);
  const secondOperation = vi.fn(async () => undefined);

  const first = runWithPersistentDataErasureBarrier(firstOperation);
  const second = runWithPersistentDataErasureBarrier(secondOperation);
  await vi.waitFor(() => expect(firstOperation).toHaveBeenCalledOnce());
  expect(secondOperation).not.toHaveBeenCalled();

  releaseFirst();
  await first;
  await second;
  expect(secondOperation).toHaveBeenCalledOnce();
});

it('releases the live lock after a failed owner so a retry can proceed', async () => {
  await expect(
    runWithPersistentDataErasureBarrier(async () => {
      throw new Error('failed cleanup');
    })
  ).rejects.toThrow('failed cleanup');

  const retry = vi.fn(async () => 'completed');
  await expect(runWithPersistentDataErasureBarrier(retry)).resolves.toBe('completed');
  expect(retry).toHaveBeenCalledOnce();
});

it('serializes domain read-modify-write owners through an exclusive named lock', async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const first = vi.fn(async () => firstGate);
  const second = vi.fn(async () => undefined);

  const firstMutation = runWithPersistenceDomainMutationLock('highlighter-settings', first);
  const secondMutation = runWithPersistenceDomainMutationLock('highlighter-settings', second);
  await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
  expect(second).not.toHaveBeenCalled();

  releaseFirst();
  await firstMutation;
  await secondMutation;
  expect(second).toHaveBeenCalledOnce();
});

it('serializes gradient preset mutations through their cross-context domain', async () => {
  const calls: string[] = [];
  const first = runWithPersistenceDomainMutationLock('gradient-presets', async () => {
    calls.push('first');
    await Promise.resolve();
  });
  const second = runWithPersistenceDomainMutationLock('gradient-presets', async () => {
    calls.push('second');
  });
  await Promise.all([first, second]);
  expect(calls).toEqual(['first', 'second']);
});

it('acquires multi-domain mutations in canonical order and blocks overlapping owners', async () => {
  let releaseBatch!: () => void;
  const batchGate = new Promise<void>((resolve) => {
    releaseBatch = resolve;
  });
  const batch = vi.fn(async () => batchGate);
  const single = vi.fn(async () => undefined);

  const batchMutation = runWithPersistenceDomainMutationLocks(
    ['step-badge-presets', 'annotation-template-tags', 'callout-presets'],
    batch
  );
  await vi.waitFor(() => expect(batch).toHaveBeenCalledOnce());
  const singleMutation = runWithPersistenceDomainMutationLock('callout-presets', single);
  await Promise.resolve();
  expect(single).not.toHaveBeenCalled();

  releaseBatch();
  await batchMutation;
  await singleMutation;
  expect(single).toHaveBeenCalledOnce();
});

it('reserves the global persistence authority for a cross-domain transaction', async () => {
  let releaseTransaction!: () => void;
  const transactionGate = new Promise<void>((resolve) => {
    releaseTransaction = resolve;
  });
  let transactionPermit: unknown;
  const transactionOperation = vi.fn(async (permit: unknown) => {
    transactionPermit = permit;
    await transactionGate;
  });
  const concurrentMutation = vi.fn(async () => undefined);

  const transaction = runWithExclusivePersistenceMutationPermit(transactionOperation);
  await vi.waitFor(() => expect(transactionOperation).toHaveBeenCalledOnce());
  expect(isActivePersistenceMutationPermit(transactionPermit)).toBe(true);

  const mutation = runWithPersistenceMutationPermit(concurrentMutation);
  await Promise.resolve();
  expect(concurrentMutation).not.toHaveBeenCalled();

  releaseTransaction();
  await transaction;
  await mutation;
  expect(concurrentMutation).toHaveBeenCalledOnce();
  expect(isActivePersistenceMutationPermit(transactionPermit)).toBe(false);
});

it('keeps a domain read-modify-write admitted until privacy erasure can begin', async () => {
  let releaseMutation!: () => void;
  const mutationGate = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });
  let receivedPermit: unknown;
  const domainMutation = vi.fn(async (permit: unknown) => {
    receivedPermit = permit;
    await mutationGate;
  });
  const erasureOperation = vi.fn(async () => undefined);

  const mutation = runWithPersistenceDomainMutationLock('highlighter-settings', domainMutation);
  await vi.waitFor(() => expect(domainMutation).toHaveBeenCalledOnce());
  expect(isActivePersistenceMutationPermit(receivedPermit)).toBe(true);

  const erasure = runWithPersistentDataErasureBarrier(erasureOperation);
  await Promise.resolve();
  expect(erasureOperation).not.toHaveBeenCalled();

  releaseMutation();
  await mutation;
  await erasure;
  expect(erasureOperation).toHaveBeenCalledOnce();
  expect(isActivePersistenceMutationPermit(receivedPermit)).toBe(false);
});

it('prevents a private-browsing writer from escaping the shared Web Lock authority', () => {
  const manifest = JSON.parse(readFileSync('apps/extension/manifest.json', 'utf8')) as Record<
    string,
    unknown
  >;

  expect(manifest['incognito']).toBe('not_allowed');
});

it('routes every persistence operation through its exact named lock and mode', async () => {
  const requests: Array<{ mode: 'exclusive' | 'shared'; name: string }> = [];
  installPersistenceLockManagerForTests({
    async request(name, options, operation) {
      requests.push({ mode: options.mode, name });
      return operation();
    },
  });

  await runWithPersistenceMutationPermit(async () => undefined);
  await runWithExclusivePersistenceMutationPermit(async () => undefined);
  await runWithPersistenceMutationTransition(async () => undefined);
  const transition = await acquirePersistenceMutationTransition();
  await transition.release();
  await runWithDurableAssetLifecycleLock(async () => undefined);
  await runWithDurableAssetOperation(async () => undefined);
  await runWithDurableAssetOperationRecovery(undefined, async () => undefined);
  await runWithPersistentDataErasureBarrier(async () => undefined);
  await runWithPersistenceDomainMutationLocks(
    ['video-settings', 'callout-presets', 'video-settings'],
    async () => undefined
  );

  expect(requests).toEqual([
    { mode: 'shared', name: 'sniptale:persistence:privacy-erasure' },
    { mode: 'shared', name: 'sniptale:persistence:privacy-erasure:transition' },
    { mode: 'exclusive', name: 'sniptale:persistence:privacy-erasure' },
    { mode: 'shared', name: 'sniptale:persistence:privacy-erasure:transition' },
    { mode: 'shared', name: 'sniptale:persistence:privacy-erasure:transition' },
    { mode: 'exclusive', name: 'sniptale:persistence:privacy-erasure:durable-assets' },
    { mode: 'exclusive', name: 'sniptale:persistence:privacy-erasure:durable-asset-operations' },
    { mode: 'exclusive', name: 'sniptale:persistence:privacy-erasure:durable-asset-operations' },
    { mode: 'exclusive', name: 'sniptale:persistence:privacy-erasure:transition' },
    { mode: 'exclusive', name: 'sniptale:persistence:privacy-erasure' },
    { mode: 'shared', name: 'sniptale:persistence:privacy-erasure' },
    { mode: 'exclusive', name: 'sniptale:persistence:privacy-erasure:callout-presets' },
    { mode: 'exclusive', name: 'sniptale:persistence:privacy-erasure:video-settings' },
  ]);
});

it('uses the fallback lock queue outside extension runtimes and clears it on reset', async () => {
  installPersistenceLockManagerForTests(null);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('chrome', undefined);
  const calls: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = runWithPersistenceMutationPermit(async () => {
    calls.push('first');
    await firstGate;
  });
  const second = runWithPersistenceMutationPermit(async () => {
    calls.push('second');
  });
  await vi.waitFor(() => expect(calls).toEqual(['first']));
  releaseFirst();
  await Promise.all([first, second]);
  expect(calls).toEqual(['first', 'second']);

  installPersistenceLockManagerForTests(null);
  await expect(runWithPersistenceMutationPermit(async () => 'reset')).resolves.toBe('reset');
  vi.unstubAllGlobals();
});

it('fails closed when an extension runtime has no persistent lock manager', async () => {
  installPersistenceLockManagerForTests(null);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('chrome', {});

  expect(() => runWithPersistenceMutationPermit(async () => undefined)).toThrow(
    'Persistent mutation coordination is unavailable'
  );
  vi.unstubAllGlobals();
});

it('uses the browser Web Locks manager when no test manager is installed', async () => {
  installPersistenceLockManagerForTests(null);
  const requests: Array<{ mode: 'exclusive' | 'shared'; name: string }> = [];
  const locks: PersistenceLockManager = {
    async request(name, options, operation) {
      requests.push({ mode: options.mode, name });
      return operation();
    },
  };
  vi.stubGlobal('navigator', { locks });
  vi.stubGlobal('chrome', {});

  await expect(runWithPersistenceMutationPermit(async () => 'locked')).resolves.toBe('locked');
  expect(requests).toEqual([{ mode: 'shared', name: 'sniptale:persistence:privacy-erasure' }]);
  vi.unstubAllGlobals();
});

it('uses the fallback lock manager when navigator is unavailable', async () => {
  installPersistenceLockManagerForTests(null);
  vi.stubGlobal('navigator', undefined);
  vi.stubGlobal('chrome', undefined);

  await expect(runWithPersistenceMutationPermit(async () => 'fallback')).resolves.toBe('fallback');
  vi.unstubAllGlobals();
});

it('clears an active fallback queue when the lock manager is reset', async () => {
  installPersistenceLockManagerForTests(null);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('chrome', undefined);
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const first = runWithPersistenceMutationPermit(async () => firstGate);
  await Promise.resolve();

  installPersistenceLockManagerForTests(null);
  const replacement = vi.fn(async () => 'replacement');
  await expect(runWithPersistenceMutationPermit(replacement)).resolves.toBe('replacement');
  expect(replacement).toHaveBeenCalledOnce();

  releaseFirst();
  await first;
  vi.unstubAllGlobals();
});

it('rejects forged and expired recovery permits by reacquiring their owner locks', async () => {
  const requests: string[] = [];
  installPersistenceLockManagerForTests({
    async request(name, _options, operation) {
      requests.push(name);
      return operation();
    },
  });
  let expiredTransition: PersistenceMutationTransitionPermit | undefined;
  let expiredDurable: DurableAssetOperationPermit | undefined;
  await runWithPersistenceMutationTransition(async (permit) => {
    expiredTransition = permit;
  });
  await runWithDurableAssetOperation(async (permit) => {
    expiredDurable = permit;
  });
  requests.length = 0;

  await runWithPersistenceMutationTransitionRecovery(
    {} as PersistenceMutationTransitionPermit,
    async () => undefined
  );
  await runWithPersistenceMutationTransitionRecovery(expiredTransition, async () => undefined);
  await runWithDurableAssetOperationRecovery(
    {} as DurableAssetOperationPermit,
    async () => undefined
  );
  await runWithDurableAssetOperationRecovery(expiredDurable, async () => undefined);

  expect(requests).toEqual([
    'sniptale:persistence:privacy-erasure:transition',
    'sniptale:persistence:privacy-erasure:transition',
    'sniptale:persistence:privacy-erasure:durable-asset-operations',
    'sniptale:persistence:privacy-erasure:durable-asset-operations',
  ]);
});
