import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createChromeStub } from '@sniptale/platform/browser/test-fixtures';

const key = 'sniptale-locale-preference';
let values: Record<string, unknown>;
let chromeStub: ReturnType<typeof createChromeStub>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetModules();
  values = {};
  chromeStub = createChromeStub();
  vi.stubGlobal('chrome', chromeStub);
  chromeStub.storage.local.get.mockImplementation((_keys, callback) => callback({ ...values }));
  chromeStub.storage.local.set.mockImplementation((items, callback) => {
    Object.assign(values, items);
    callback();
  });
  chromeStub.storage.local.remove.mockImplementation((keys, callback) => {
    for (const item of typeof keys === 'string' ? [keys] : keys) delete values[item];
    callback();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('persists English only for an absent preference and hydrates the locale', async () => {
  const locale = await import('./state');
  await locale.initializeLocalePreference();
  expect(values[key]).toBe('en');
  expect(locale.getStoredLocalePreference()).toBe('en');
  await locale.initializeLocalePreference();
  expect(chromeStub.storage.local.set).toHaveBeenCalledTimes(1);
});

it.each(['ru', 'future-locale', null])('preserves an existing preference %s', async (stored) => {
  values[key] = stored;
  const locale = await import('./state');
  await locale.initializeLocalePreference();
  expect(values[key]).toBe(stored);
  expect(chromeStub.storage.local.set).not.toHaveBeenCalled();
});

it('keeps an explicit choice that completes before a delayed initializer', async () => {
  const locale = await import('./state');
  await locale.setLocalePreference('ru');
  await locale.initializeLocalePreference();
  expect(values[key]).toBe('ru');
  expect(locale.getCurrentLocale()).toBe('ru');
});

it('serializes an explicit choice behind the initial read and conditional write', async () => {
  const locale = await import('./state');
  const entered = deferred();
  const release = deferred();
  chromeStub.storage.local.get.mockImplementationOnce((_keys, callback) => {
    entered.resolve();
    void release.promise.then(() => callback({ ...values }));
  });
  const initialization = locale.initializeLocalePreference();
  await entered.promise;
  const choice = locale.setLocalePreference('ru');
  expect(chromeStub.storage.local.set).not.toHaveBeenCalled();
  release.resolve();
  await Promise.all([initialization, choice]);
  expect(values[key]).toBe('ru');
  expect(locale.getCurrentLocale()).toBe('ru');
});

it('does not recreate an erased preference when admitted initialization settles', async () => {
  const locale = await import('./state');
  const { runWithPersistentDataErasureBarrier } =
    await import('../../../composition/persistence/infrastructure/mutation-barrier');
  const entered = deferred();
  const release = deferred();
  chromeStub.storage.local.get.mockImplementationOnce((_keys, callback) => {
    entered.resolve();
    void release.promise.then(() => callback({ ...values }));
  });
  const initialization = locale.initializeLocalePreference();
  await entered.promise;
  const erasure = runWithPersistentDataErasureBarrier(async () => {
    delete values[key];
  });
  release.resolve();
  await Promise.all([initialization, erasure]);
  expect(values[key]).toBeUndefined();
  await locale.setLocalePreference('ru');
  await locale.initializeLocalePreference();
  expect(values[key]).toBe('ru');
});

it.each(['get', 'set'] as const)(
  'releases authority after a refused %s and preserves a later choice on retry',
  async (operation) => {
    const locale = await import('./state');
    chromeStub.storage.local[operation].mockImplementationOnce((_items, callback) => {
      chromeStub.runtime.lastError = { message: 'storage refused' };
      callback({});
      chromeStub.runtime.lastError = undefined;
    });
    await expect(locale.initializeLocalePreference()).rejects.toThrow('storage refused');
    expect(values[key]).toBeUndefined();
    await locale.setLocalePreference('ru');
    await locale.initializeLocalePreference();
    expect(values[key]).toBe('ru');
  }
);
