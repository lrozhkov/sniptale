import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  isActivePersistenceMutationPermit,
  installPersistenceLockManagerForTests,
  runWithPersistenceMutationPermit,
  runWithPersistentDataErasureBarrier,
  type PersistenceLockManager,
} from './mutation-barrier';

interface PendingLock {
  mode: 'exclusive' | 'shared';
  operation: () => unknown | Promise<unknown>;
  reject(error: unknown): void;
  resolve(value: unknown): void;
}

async function runPendingLock(lock: PendingLock): Promise<void> {
  try {
    lock.resolve(await lock.operation());
  } catch (error) {
    lock.reject(error);
  }
}

function createLockManager(): PersistenceLockManager {
  const pending: PendingLock[] = [];
  let activeExclusive = false;
  let activeShared = 0;

  function drain(): void {
    if (activeExclusive || pending.length === 0) return;
    const first = pending[0]!;
    if (first.mode === 'exclusive') {
      if (activeShared > 0) return;
      pending.shift();
      activeExclusive = true;
      void runPendingLock(first).finally(() => {
        activeExclusive = false;
        drain();
      });
      return;
    }

    while (pending[0]?.mode === 'shared' && !activeExclusive) {
      const next = pending.shift()!;
      activeShared += 1;
      void runPendingLock(next).finally(() => {
        activeShared -= 1;
        drain();
      });
    }
  }

  return {
    request<T>(
      _name: string,
      options: { mode: 'exclusive' | 'shared' },
      operation: () => T | Promise<T>
    ) {
      return new Promise<T>((resolve, reject) => {
        pending.push({
          mode: options.mode,
          operation,
          reject,
          resolve: resolve as (value: unknown) => void,
        });
        drain();
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

it('prevents a private-browsing writer from escaping the shared Web Lock authority', () => {
  const manifest = JSON.parse(readFileSync('apps/extension/manifest.json', 'utf8')) as Record<
    string,
    unknown
  >;

  expect(manifest['incognito']).toBe('not_allowed');
});
