import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import {
  loadPickerCompact,
  savePickerCompact,
  subscribePickerCompact,
  loadPickerCatalog,
  savePickerCatalog,
  subscribePickerCatalog,
} from './index';

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

describe.each([
  {
    key: 'sniptale_picker_compact',
    load: loadPickerCompact,
    save: savePickerCompact,
    subscribe: subscribePickerCompact,
  },
  {
    key: 'sniptale_picker_catalog',
    load: loadPickerCatalog,
    save: savePickerCatalog,
    subscribe: subscribePickerCatalog,
  },
])('$key', ({ key, load, save, subscribe }) => {
  it('reads only an explicit true and never repairs storage while reading', async () => {
    for (const stored of [undefined, null, false, 'true', 1, {}, []]) {
      storage.get.mockResolvedValue({ [key]: stored });
      await expect(load()).resolves.toBe(false);
    }
    storage.get.mockResolvedValue({ [key]: true });
    await expect(load()).resolves.toBe(true);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('propagates a failed read without writing a replacement', async () => {
    storage.get.mockRejectedValue(new Error('unavailable'));
    await expect(load()).rejects.toThrow('unavailable');
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
    storage.set.mockImplementation(async (values: Record<string, boolean>, permit: unknown) => {
      expect(isActivePersistenceMutationPermit(permit)).toBe(true);
      persisted = values[key];
      if (storage.set.mock.calls.length === 1) {
        entered.resolve();
        await release.promise;
      }
    });
    const first = save(true);
    await entered.promise;
    const last = save(false);
    await last;
    expect(persisted).toBe(false);
    release.resolve();
    await Promise.all([first, last]);
    expect(persisted).toBe(false);
    expect(storage.set.mock.calls.map(([values]) => values)).toEqual([
      { [key]: true },
      { [key]: false },
    ]);
    expect(requests).toContain('sniptale:persistence:privacy-erasure');
    expect(requests).toEqual([
      'sniptale:persistence:privacy-erasure',
      'sniptale:persistence:privacy-erasure',
    ]);
  });

  it('preserves refusal and permits an idempotent retry', async () => {
    storage.set.mockRejectedValueOnce(new Error('refused'));
    await expect(save(true)).rejects.toThrow('refused');
    await expect(save(true)).resolves.toBeUndefined();
    expect(storage.set.mock.calls.map(([values]) => values)).toEqual([
      { [key]: true },
      { [key]: true },
    ]);
  });

  it('does not write if the persistence barrier refuses acquisition', async () => {
    installPersistenceLockManagerForTests({
      request: async () => {
        throw new Error('barrier refused');
      },
    });
    await expect(save(true)).rejects.toThrow('barrier refused');
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('observes local density changes and defaults removal or malformed values to full', () => {
    const stop = vi.fn();
    storage.subscribe.mockReturnValue(stop);
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    const callback = storage.subscribe.mock.calls[0]?.[0];
    callback({ [key]: { newValue: true } }, 'sync');
    callback({ unrelated: { newValue: true } }, 'local');
    expect(listener).not.toHaveBeenCalled();
    callback({ [key]: { newValue: true } }, 'local');
    callback({ [key]: { newValue: 'true' } }, 'local');
    callback({ [key]: {} }, 'local');
    expect(listener.mock.calls).toEqual([[true], [false], [false]]);
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
    storage.observe.mockReturnValue(false);
    expect(subscribe(listener)).toBeTypeOf('function');
    expect(storage.subscribe).toHaveBeenCalledOnce();
  });
});
