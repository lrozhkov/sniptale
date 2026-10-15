import { afterEach, expect, it, vi } from 'vitest';
import { createRuntimeLog, RUNTIME_LOG_STORAGE_KEY as KEY } from './runtime-log';
import { installPersistenceLockManagerForTests } from '../infrastructure/mutation-barrier';
afterEach(() => {
  vi.useRealTimers();
  installPersistenceLockManagerForTests(null);
});
const event = (index = 0) => ({
  time: new Date(Date.now() + index).toISOString(),
  source: 'Capture',
  level: 'debug' as const,
  message: `Step ${index}`,
});
function fixture() {
  let stored: unknown;
  let queue = Promise.resolve();
  const area = {
    get: vi.fn(async () => ({ [KEY]: stored })),
    set: vi.fn(async (value: Record<string, unknown>) => {
      stored = value[KEY];
    }),
  };
  const withLock = (work: () => Promise<void>) => {
    const next = queue.then(work);
    queue = next.catch(() => undefined);
    return next;
  };
  return { area, withLock, log: createRuntimeLog({ area, withLock }) };
}
it('batches a burst with a strict queue bound and becomes idle afterwards', async () => {
  vi.useFakeTimers();
  const f = fixture();
  for (let i = 0; i < 100; i++) f.log.append(event(i), 'background');
  expect(f.area.set).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  await f.log.settled();
  const rows = await f.log.read();
  expect(rows).toHaveLength(64);
  expect(rows.at(-1)?.dropped).toBe(36);
  expect(f.area.set).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('serializes independent contexts against fresh storage', async () => {
  const f = fixture();
  const a = createRuntimeLog({ area: f.area, withLock: f.withLock, delay: async () => undefined });
  const b = createRuntimeLog({ area: f.area, withLock: f.withLock, delay: async () => undefined });
  a.append(event(), 'background');
  b.append(event(1), 'page');
  await Promise.all([a.settled(), b.settled()]);
  expect(await f.log.read()).toHaveLength(2);
});
it('refuses erasure-pending capture and isolates quota errors without retry timers', async () => {
  const f = fixture();
  const blocked = createRuntimeLog({ area: f.area, withPermit: async () => null });
  blocked.append(event(), 'background');
  await blocked.settled();
  expect(f.area.get).not.toHaveBeenCalled();
  f.area.set.mockRejectedValueOnce(new Error('quota'));
  const log = createRuntimeLog({
    area: f.area,
    withLock: f.withLock,
    delay: async () => undefined,
  });
  log.append(event(), 'page');
  await expect(log.settled()).resolves.toBeUndefined();
});
it('holds the admitted permit through the batch delay and write', async () => {
  vi.useFakeTimers();
  let active = 0;
  installPersistenceLockManagerForTests({
    request: async (_name, _options, work) => {
      active++;
      try {
        return await work({});
      } finally {
        active--;
      }
    },
  });
  const f = fixture();
  f.log.append(event(), 'page');
  await vi.advanceTimersByTimeAsync(0);
  expect(active).toBeGreaterThan(0);
  await vi.advanceTimersByTimeAsync(1000);
  await f.log.settled();
  expect(active).toBe(0);
  expect(f.area.set).toHaveBeenCalledOnce();
});
it('observes its local key without reacting to unrelated storage or polling', async () => {
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
it('does not write without coordination and validates events before starting a batch', async () => {
  const f = fixture();
  vi.stubGlobal('navigator', {});
  const log = createRuntimeLog({ area: f.area, delay: async () => undefined });
  log.append({ ...event(), time: 'bad' }, 'page');
  await log.settled();
  expect(f.area.get).not.toHaveBeenCalled();
  log.append(event(), 'page');
  await log.settled();
  expect(f.area.set).not.toHaveBeenCalled();
  installPersistenceLockManagerForTests({ request: async (_name, _options, work) => work({}) });
  const request = vi.fn(async (_name: string, work: () => Promise<void>) => work());
  vi.stubGlobal('navigator', { locks: { request } });
  log.append(event(), 'page');
  await log.settled();
  expect(request).toHaveBeenCalledWith('sniptale:runtime-diagnostic-log', expect.any(Function));
  expect(f.area.set).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
it('queues events during a slow storage write for the next admitted batch', async () => {
  const f = fixture();
  let began!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.area.get.mockImplementationOnce(async () => {
    began();
    await gate;
    return { [KEY]: undefined };
  });
  const log = createRuntimeLog({
    area: f.area,
    withLock: f.withLock,
    delay: async () => undefined,
  });
  log.append(event(), 'page');
  await started;
  log.append(event(1), 'page');
  release();
  await log.settled();
  log.append(event(2), 'page');
  await log.settled();
  expect(await log.read()).toHaveLength(3);
  expect((await log.read()).every((entry) => entry.dropped === 0)).toBe(true);
});
