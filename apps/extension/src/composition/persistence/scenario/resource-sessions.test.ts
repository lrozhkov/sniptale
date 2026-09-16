import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  acquireScenarioResourceSession,
  runWithScenarioResourceRead,
  tryScenarioResourceCleanup,
} from './resource-sessions';

function lockManager() {
  const active = new Map<string, { mode: string; released: Promise<void> }[]>();
  return {
    request: async <T>(
      name: string,
      options: { mode: string; ifAvailable?: boolean },
      callback: (lock: unknown) => T
    ) => {
      const blocked = () =>
        (active.get(name) ?? []).filter(
          (held) => options.mode === 'exclusive' || held.mode === 'exclusive'
        );
      if (options.ifAvailable && blocked().length) return callback(null);
      while (blocked().length) await Promise.all(blocked().map((held) => held.released));
      let release!: () => void;
      const held = {
        mode: options.mode,
        released: new Promise<void>((resolve) => {
          release = resolve;
        }),
      };
      active.set(name, [...(active.get(name) ?? []), held]);
      try {
        return await callback({ name, mode: options.mode });
      } finally {
        active.set(
          name,
          (active.get(name) ?? []).filter((entry) => entry !== held)
        );
        release();
      }
    },
  };
}
beforeEach(() => vi.stubGlobal('navigator', { locks: lockManager() }));
afterEach(() => vi.unstubAllGlobals());
it('defers only the active project until every editing session releases it', async () => {
  const first = await acquireScenarioResourceSession('guide');
  const second = await acquireScenarioResourceSession('guide');
  const clean = vi.fn(async () => 3);
  expect(await tryScenarioResourceCleanup('guide', clean)).toBeUndefined();
  expect(clean).not.toHaveBeenCalled();
  expect(await tryScenarioResourceCleanup('other', clean)).toBe(3);
  await first.release();
  expect(await tryScenarioResourceCleanup('guide', clean)).toBeUndefined();
  await second.release();
  expect(await tryScenarioResourceCleanup('guide', clean)).toBe(3);
});
it('excludes pruning throughout a backup read and releases protection after failure', async () => {
  await expect(
    runWithScenarioResourceRead(async () => {
      expect(await tryScenarioResourceCleanup('guide', async () => 1)).toBeUndefined();
      throw new Error('cancelled');
    })
  ).rejects.toThrow('cancelled');
  await expect(
    tryScenarioResourceCleanup('guide', async () => {
      throw new Error('write failed');
    })
  ).rejects.toThrow('write failed');
  expect(await tryScenarioResourceCleanup('guide', async () => 1)).toBe(1);
});
it('fails closed for pruning without locks and rejects extension session admission', async () => {
  vi.stubGlobal('navigator', {});
  const clean = vi.fn();
  expect(await tryScenarioResourceCleanup('guide', clean)).toBeUndefined();
  expect(clean).not.toHaveBeenCalled();
  vi.stubGlobal('chrome', {});
  await expect(acquireScenarioResourceSession('guide')).rejects.toThrow('unavailable');
});
