import { afterEach, expect, it, vi } from 'vitest';
import {
  acquireAssetResourceSession,
  runWithAssetResourceRead,
  tryAssetResourceCleanup,
} from './resource-sessions';

afterEach(() => vi.unstubAllGlobals());

it('protects all readers until the last native lease releases', async () => {
  let readers = 0;
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        _name: string,
        options: { mode: string },
        action: (lock: object | null) => Promise<unknown>
      ) => {
        if (options.mode === 'exclusive') return action(readers ? null : {});
        readers++;
        try {
          return await action({});
        } finally {
          readers--;
        }
      },
    },
  });
  const first = await acquireAssetResourceSession();
  const second = await acquireAssetResourceSession();
  const cleanup = vi.fn(async () => 'deleted');
  expect(await tryAssetResourceCleanup(cleanup)).toBeUndefined();
  await first.release();
  expect(await tryAssetResourceCleanup(cleanup)).toBeUndefined();
  await second.release();
  expect(await tryAssetResourceCleanup(cleanup)).toBe('deleted');
  expect(cleanup).toHaveBeenCalledOnce();
});

it('holds export protection until failure settles and requests cleanup without waiting', async () => {
  const request = vi.fn(
    async (_name: string, _options: unknown, operation: () => Promise<unknown>) => operation()
  );
  vi.stubGlobal('navigator', { locks: { request } });
  await expect(
    runWithAssetResourceRead(async () => {
      throw new Error('cancelled');
    })
  ).rejects.toThrow('cancelled');
  expect(request).toHaveBeenCalledWith(
    'sniptale:assets:resource-readers',
    { mode: 'shared' },
    expect.any(Function)
  );
  await tryAssetResourceCleanup(async () => 1);
  expect(request).toHaveBeenLastCalledWith(
    'sniptale:assets:resource-readers',
    { mode: 'exclusive', ifAvailable: true },
    expect.any(Function)
  );
});

it('fails closed in an extension without native reader coordination', async () => {
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('chrome', {});
  const cleanup = vi.fn();
  expect(await tryAssetResourceCleanup(cleanup)).toBeUndefined();
  expect(cleanup).not.toHaveBeenCalled();
  await expect(acquireAssetResourceSession()).rejects.toThrow('unavailable');
});

it('propagates failed native acquisition instead of admitting an unprotected reader', async () => {
  const request = vi.fn(async () => {
    throw new Error('Native lock failed');
  });
  vi.stubGlobal('navigator', { locks: { request } });
  await expect(acquireAssetResourceSession()).rejects.toThrow('Native lock failed');
  expect(request).toHaveBeenCalledOnce();
});

it('supports the non-extension adapter without browser coordination', async () => {
  vi.stubGlobal('navigator', undefined);
  vi.stubGlobal('chrome', undefined);
  const read = vi.fn(async () => 'available');
  expect(await runWithAssetResourceRead(read)).toBe('available');
  const session = await acquireAssetResourceSession();
  await session.release();
  expect(await tryAssetResourceCleanup(read)).toBe('available');
  expect(read).toHaveBeenCalledTimes(2);
});
