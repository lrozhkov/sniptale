import { afterEach, expect, it, vi } from 'vitest';

import { EXPECTED_INDEXES, EXPECTED_STORES } from './core.stores.ts';

const { openDB } = vi.hoisted(() => ({ openDB: vi.fn() }));

vi.mock('idb', () => ({ openDB }));

afterEach(() => {
  vi.unstubAllGlobals();
});

it('does not accept a forged mutation permit as an initialization bypass', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(true) } });
  const expectedIndexes: Readonly<Record<string, readonly string[]>> = EXPECTED_INDEXES;
  const database = {
    objectStoreNames: [...EXPECTED_STORES],
    transaction: vi.fn((storeName: string) => ({
      objectStore: vi.fn(() => ({ indexNames: [...(expectedIndexes[storeName] ?? [])] })),
    })),
  };
  openDB.mockResolvedValue(database);
  const module = await import('./core');
  const barrier = await import('../mutation-barrier');
  let releaseErasure!: () => void;
  const erasureGate = new Promise<void>((resolve) => {
    releaseErasure = resolve;
  });
  const erasure = barrier.runWithPersistentDataErasureBarrier(async () => erasureGate);
  await Promise.resolve();

  const initialization = Reflect.apply(module.initDB, undefined, [{}]);
  await Promise.resolve();
  expect(openDB).not.toHaveBeenCalled();

  releaseErasure();
  await erasure;
  await expect(initialization).resolves.toBe(database);
});
