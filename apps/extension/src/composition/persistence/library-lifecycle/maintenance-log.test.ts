import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createMaintenanceLogEntry } from './maintenance-log-model';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { afterEach, expect, it, vi } from 'vitest';
import { createMaintenanceLog, MAINTENANCE_LOG_STORAGE_KEY as KEY } from './maintenance-log';
import { installPersistenceLockManagerForTests } from '../infrastructure/mutation-barrier';
afterEach(() => installPersistenceLockManagerForTests(null));

function fixture() {
  let stored: unknown;
  let queue = Promise.resolve();
  const area = {
    get: vi.fn(async () => ({ [KEY]: stored })),
    set: vi.fn(async (value: Record<string, unknown>) => {
      stored = value[KEY];
    }),
  };
  const withLock = (operation: () => Promise<boolean>) => {
    const result = queue.then(operation);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
  const create = () => createMaintenanceLog({ area, withLock, now: () => 1000 });
  return { area, create, log: create() };
}
it('persists a bounded event, reads without writes and reloads inside the cross-context lock', async () => {
  const f = fixture();
  const other = f.create();
  await Promise.all([
    f.log.append({ operation: 'drafts', code: 'expired', counts: { deleted: 1 } }),
    other.append({ operation: 'trash', code: 'expired', counts: { deleted: 2 } }),
  ]);
  expect(await f.log.read()).toHaveLength(2);
  expect(f.area.set).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(await f.log.read())).not.toContain('undefined');
});
it('does not turn storage failure or erasure refusal into maintenance failure', async () => {
  const f = fixture();
  f.area.get.mockRejectedValueOnce(new Error('unavailable'));
  await expect(f.log.append({ operation: 'trash', code: 'failed' })).resolves.toBe(false);
  f.area.set.mockRejectedValueOnce(new Error('quota'));
  await expect(f.log.append({ operation: 'trash', code: 'failed' })).resolves.toBe(false);
  const blocked = createMaintenanceLog({ area: f.area, withPermit: async () => null });
  const reads = f.area.get.mock.calls.length;
  await expect(blocked.append({ operation: 'trash', code: 'failed' })).resolves.toBe(false);
  expect(f.area.get).toHaveBeenCalledTimes(reads);
  f.area.get.mockRejectedValueOnce(new Error('unavailable'));
  await expect(f.log.read()).rejects.toThrow('unavailable');
});
it('holds the erasure permit until an admitted queued write drains', async () => {
  let active = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => {
      active++;
      try {
        return await operation({});
      } finally {
        active--;
      }
    },
  });
  const f = fixture();
  const log = createMaintenanceLog({
    area: f.area,
    withLock: async (operation) => {
      await gate;
      expect(active).toBeGreaterThan(0);
      return operation();
    },
  });
  const writing = log.append({ operation: 'orphans', code: 'empty' });
  await vi.waitFor(() => expect(active).toBeGreaterThan(0));
  expect(f.area.set).not.toHaveBeenCalled();
  release();
  expect(await writing).toBe(true);
  expect(active).toBe(0);
});
it('observes only its local key and releases the subscription', async () => {
  const { browserStorage } = await import('../infrastructure/browser-storage');
  const changed = vi.fn();
  const unsubscribe = vi.fn();
  let notify: Parameters<typeof browserStorage.subscribeToChanges>[0] = () => undefined;
  const observable = vi.spyOn(browserStorage, 'canObserveChanges').mockReturnValue(true);
  const subscription = vi
    .spyOn(browserStorage, 'subscribeToChanges')
    .mockImplementation((listener) => {
      notify = listener;
      return unsubscribe;
    });
  const stop = fixture().log.subscribe(changed);
  notify({ other: {} }, 'local');
  notify({ [KEY]: {} }, 'sync');
  expect(changed).not.toHaveBeenCalled();
  notify({ [KEY]: {} }, 'local');
  expect(changed).toHaveBeenCalledOnce();
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
  observable.mockReturnValue(false);
  fixture().log.subscribe(changed)();
  subscription.mockRestore();
  observable.mockRestore();
});
it('fails closed without Web Locks and uses the default cross-context lock when available', async () => {
  const f = fixture();
  vi.stubGlobal('navigator', {});
  expect(
    await createMaintenanceLog({ area: f.area }).append({ operation: 'trash', code: 'failed' })
  ).toBe(false);
  installPersistenceLockManagerForTests({ request: async (_name, _options, work) => work({}) });
  const request = vi.fn(async (_name: string, _options: unknown, work: () => Promise<boolean>) =>
    work()
  );
  vi.stubGlobal('navigator', { locks: { request } });
  const log = createMaintenanceLog({ area: f.area });
  expect(await log.append({ operation: 'trash', code: 'failed' })).toBe(true);
  expect(request).toHaveBeenCalledWith(
    'sniptale:library-maintenance-log',
    { mode: 'exclusive' },
    expect.any(Function)
  );
  expect(await Reflect.apply(log.append, log, [{ operation: 'unknown', code: 'invalid' }])).toBe(
    false
  );
  vi.unstubAllGlobals();
});

it('hands off an offscreen event to the storage owner without chrome.storage', async () => {
  const f = fixture();
  let received: Promise<boolean> | undefined;
  const port = {
    postMessage(raw: unknown) {
      const entry = isRecord(raw) ? createMaintenanceLogEntry(raw['input'], 1000) : null;
      if (entry) received = f.log.append(entry);
    },
    disconnect: vi.fn(),
    onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  vi.stubGlobal('chrome', { runtime: { connect: () => port } });
  const remote = createMaintenanceLog();
  try {
    expect(
      await remote.append({ operation: 'physical-delete', code: 'deleted', counts: { deleted: 2 } })
    ).toBe(true);
    await received;
    expect(await f.log.read()).toEqual([
      expect.objectContaining({
        operation: 'physical-delete',
        code: 'deleted',
        counts: { deleted: 2 },
      }),
    ]);
    port.onDisconnect.addListener.mock.calls[0]![0]();
    const connect = vi.spyOn(browserRuntime, 'connect').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(await remote.append({ operation: 'physical-delete', code: 'deleted' })).toBe(false);
    connect.mockRestore();
  } finally {
    vi.unstubAllGlobals();
  }
});
