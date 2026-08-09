import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  isActivePersistenceMutationPermit,
  installPersistenceLockManagerForTests,
  runWithPersistenceMutationPermit,
  runWithPersistenceMutationTransition,
  runWithPersistenceDomainMutationLock,
  runWithPersistenceDomainMutationLocks,
  runWithPersistentDataErasureBarrier,
  type PersistenceLockManager,
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
