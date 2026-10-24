import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  installPersistenceLockManagerForTests,
  isActivePersistenceMutationPermit,
  type PersistenceLockManager,
} from '../infrastructure/mutation-barrier';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  observe: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: { get: storage.get, set: storage.set },
    canObserveChanges: storage.observe,
    subscribeToChanges: storage.subscribe,
  },
}));
import { loadPickerCompact, savePickerCompact, subscribePickerCompact } from './index';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  storage.observe.mockReturnValue(true);
  storage.set.mockResolvedValue(undefined);
  installPersistenceLockManagerForTests(null);
});
afterEach(() => installPersistenceLockManagerForTests(null));

it('reads only an explicit true and never repairs storage while reading', async () => {
  for (const stored of [undefined, null, false, 'true', 1, {}, []]) {
    storage.get.mockResolvedValue({ sniptale_picker_compact: stored });
    await expect(loadPickerCompact()).resolves.toBe(false);
  }
  storage.get.mockResolvedValue({ sniptale_picker_compact: true });
  await expect(loadPickerCompact()).resolves.toBe(true);
  expect(storage.set).not.toHaveBeenCalled();
});

it('propagates a failed read without writing a replacement', async () => {
  storage.get.mockRejectedValue(new Error('unavailable'));
  await expect(loadPickerCompact()).rejects.toThrow('unavailable');
  expect(storage.set).not.toHaveBeenCalled();
});

it('retains the last scalar write even when the earlier completion is delayed', async () => {
  const requests: string[] = [];
  const manager: PersistenceLockManager = {
    async request(name, _options, operation) {
      requests.push(name);
      return operation();
    },
  };
  installPersistenceLockManagerForTests(manager);
  const entered = deferred<void>();
  const release = deferred<void>();
  let persisted: boolean | undefined;
  storage.set.mockImplementation(
    async (values: { sniptale_picker_compact: boolean }, permit: unknown) => {
      expect(isActivePersistenceMutationPermit(permit)).toBe(true);
      persisted = values.sniptale_picker_compact;
      if (storage.set.mock.calls.length === 1) {
        entered.resolve();
        await release.promise;
      }
    }
  );
  const first = savePickerCompact(true);
  await entered.promise;
  const last = savePickerCompact(false);
  await last;
  expect(persisted).toBe(false);
  release.resolve();
  await Promise.all([first, last]);
  expect(persisted).toBe(false);
  expect(storage.set.mock.calls.map(([values]) => values)).toEqual([
    { sniptale_picker_compact: true },
    { sniptale_picker_compact: false },
  ]);
  expect(requests).toContain('sniptale:persistence:privacy-erasure');
  expect(requests).toEqual([
    'sniptale:persistence:privacy-erasure',
    'sniptale:persistence:privacy-erasure',
  ]);
});

it('preserves refusal and permits an idempotent retry', async () => {
  storage.set.mockRejectedValueOnce(new Error('refused'));
  await expect(savePickerCompact(true)).rejects.toThrow('refused');
  await expect(savePickerCompact(true)).resolves.toBeUndefined();
  expect(storage.set.mock.calls.map(([values]) => values)).toEqual([
    { sniptale_picker_compact: true },
    { sniptale_picker_compact: true },
  ]);
});

it('does not write if the persistence barrier refuses acquisition', async () => {
  installPersistenceLockManagerForTests({
    request: async () => {
      throw new Error('barrier refused');
    },
  });
  await expect(savePickerCompact(true)).rejects.toThrow('barrier refused');
  expect(storage.set).not.toHaveBeenCalled();
});

it('observes local density changes and defaults removal or malformed values to full', () => {
  const stop = vi.fn();
  storage.subscribe.mockReturnValue(stop);
  const listener = vi.fn();
  const unsubscribe = subscribePickerCompact(listener);
  const callback = storage.subscribe.mock.calls[0]?.[0];
  callback({ sniptale_picker_compact: { newValue: true } }, 'sync');
  callback({ unrelated: { newValue: true } }, 'local');
  expect(listener).not.toHaveBeenCalled();
  callback({ sniptale_picker_compact: { newValue: true } }, 'local');
  callback({ sniptale_picker_compact: { newValue: 'true' } }, 'local');
  callback({ sniptale_picker_compact: {} }, 'local');
  expect(listener.mock.calls).toEqual([[true], [false], [false]]);
  unsubscribe();
  expect(stop).toHaveBeenCalledOnce();
  storage.observe.mockReturnValue(false);
  expect(subscribePickerCompact(listener)).toBeTypeOf('function');
  expect(storage.subscribe).toHaveBeenCalledOnce();
});
