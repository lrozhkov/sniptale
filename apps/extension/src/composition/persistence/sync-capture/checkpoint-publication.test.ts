import { afterEach, expect, it, vi } from 'vitest';
import {
  acquireSyncCheckpointEdit,
  tryRunWithSyncCheckpointPublication,
} from './checkpoint-publication';

function locks() {
  type Mode = 'shared' | 'exclusive';
  type Request = { mode: Mode; start(): void };
  let readers = 0;
  let writer = false;
  const queue: Request[] = [];
  const names: string[] = [];
  const drain = () => {
    while (queue.length && !writer) {
      const next = queue[0]!;
      if (next.mode === 'exclusive' && readers) return;
      queue.shift();
      next.start();
    }
  };
  const request = <T>(
    name: string,
    options: { mode: Mode; ifAvailable?: boolean },
    callback: (lock: { name: string; mode: Mode } | null) => Promise<T> | T
  ): Promise<T> => {
    names.push(name);
    if (options.ifAvailable && (writer || readers > 0 || queue.length > 0))
      return Promise.resolve(callback(null));
    return new Promise<T>((resolve, reject) => {
      queue.push({
        mode: options.mode,
        start() {
          if (options.mode === 'exclusive') writer = true;
          else readers++;
          Promise.resolve()
            .then(() => callback({ name, mode: options.mode }))
            .then(resolve, reject)
            .finally(() => {
              if (options.mode === 'exclusive') writer = false;
              else readers--;
              drain();
            });
        },
      });
      drain();
    });
  };
  vi.stubGlobal('navigator', { locks: { request } });
  return { names };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => vi.unstubAllGlobals());

it('keeps two editors shared until both release, across profile replacement', async () => {
  const manager = locks();
  const first = await acquireSyncCheckpointEdit();
  const second = await acquireSyncCheckpointEdit();
  const freeze = vi.fn(() => 'captured');
  expect(await tryRunWithSyncCheckpointPublication(freeze)).toBeNull();
  await first.release();
  expect(await tryRunWithSyncCheckpointPublication(freeze)).toBeNull();
  await second.release();
  expect(await tryRunWithSyncCheckpointPublication(freeze)).toBe('captured');
  expect(new Set(manager.names)).toEqual(new Set(['sniptale:sync:checkpoint-publication']));
  expect(freeze).toHaveBeenCalledOnce();
});
it('keeps an edit waiting until an earlier freezer completes', async () => {
  locks();
  const entered = deferred();
  const finish = deferred();
  const frozen = tryRunWithSyncCheckpointPublication(async () => {
    entered.resolve();
    await finish.promise;
  });
  await entered.promise;
  let granted = false;
  const acquisition = acquireSyncCheckpointEdit().then((lease) => {
    granted = true;
    return lease;
  });
  await Promise.resolve();
  expect(granted).toBe(false);
  finish.resolve();
  await frozen;
  const lease = await acquisition;
  expect(granted).toBe(true);
  await lease.release();
  await lease.release();
});
it('releases exclusive admission after a callback error', async () => {
  locks();
  await expect(
    tryRunWithSyncCheckpointPublication(() => {
      throw new Error('capture failed');
    })
  ).rejects.toThrow('capture failed');
  const lease = await acquireSyncCheckpointEdit();
  await lease.release();
  expect(await tryRunWithSyncCheckpointPublication(() => true)).toBe(true);
});
it('rejects acquisition and publication after lock request failure', async () => {
  vi.stubGlobal('navigator', {
    locks: { request: () => Promise.reject(new Error('lock failed')) },
  });
  await expect(acquireSyncCheckpointEdit()).rejects.toThrow('lock failed');
  await expect(tryRunWithSyncCheckpointPublication(() => true)).rejects.toThrow('lock failed');
});
it('fails closed in Chrome when coordination is unavailable', async () => {
  vi.stubGlobal('chrome', {});
  vi.stubGlobal('navigator', {});
  const publish = vi.fn();
  await expect(acquireSyncCheckpointEdit()).rejects.toThrow('coordination is unavailable');
  expect(await tryRunWithSyncCheckpointPublication(publish)).toBeNull();
  expect(publish).not.toHaveBeenCalled();
});
it('supports the existing nonbrowser persistence harness without locks', async () => {
  vi.stubGlobal('chrome', undefined);
  vi.stubGlobal('navigator', {});
  const lease = await acquireSyncCheckpointEdit();
  await lease.release();
  expect(await tryRunWithSyncCheckpointPublication(() => 7)).toBe(7);
});
