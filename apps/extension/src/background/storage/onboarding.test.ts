import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { presentWelcomeOnce } from './onboarding';
import {
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
} from '../../composition/persistence/infrastructure/mutation-barrier';

const platform = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: platform.get, set: platform.set, remove: platform.remove } },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: { create: platform.create } }));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function fixture(initial: unknown = undefined) {
  let shown: unknown = initial;
  const deps = {
    read: vi.fn(async () => shown),
    mark: vi.fn(async () => {
      shown = true;
    }),
    clear: vi.fn(async () => {
      shown = undefined;
    }),
    open: vi.fn(async () => undefined),
  };
  return { deps, read: () => shown };
}

beforeEach(() => {
  vi.stubGlobal('chrome', undefined);
  vi.stubGlobal('navigator', {});
  installPersistenceLockManagerForTests(null);
});
afterEach(() => {
  installPersistenceLockManagerForTests(null);
  vi.unstubAllGlobals();
});

it('persists first presentation before navigation and does not repeat it after a new call', async () => {
  const f = fixture();
  f.deps.open.mockImplementation(async () => {
    expect(f.read()).toBe(true);
  });
  await expect(presentWelcomeOnce(f.deps)).resolves.toBe(true);
  await expect(presentWelcomeOnce(f.deps)).resolves.toBe(false);
  expect(f.deps.open).toHaveBeenCalledOnce();
});

it('serializes parallel installers into one successful presentation', async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred();
  f.deps.open.mockImplementation(async () => {
    entered.resolve();
    await release.promise;
  });
  const first = presentWelcomeOnce(f.deps);
  await entered.promise;
  const second = presentWelcomeOnce(f.deps);
  expect(f.deps.open).toHaveBeenCalledOnce();
  release.resolve();
  await expect(Promise.all([first, second])).resolves.toEqual([true, false]);
  expect(f.deps.mark).toHaveBeenCalledOnce();
});

it('does not open a page after a refused marker write and permits explicit retry', async () => {
  const f = fixture();
  f.deps.mark.mockRejectedValueOnce(new Error('storage-failed'));
  await expect(presentWelcomeOnce(f.deps)).rejects.toThrow('storage-failed');
  expect(f.deps.open).not.toHaveBeenCalled();
  await expect(presentWelcomeOnce(f.deps)).resolves.toBe(true);
  expect(f.deps.open).toHaveBeenCalledOnce();
});

it('compensates an observed tab failure and permits explicit retry', async () => {
  const f = fixture();
  f.deps.open.mockRejectedValueOnce(new Error('tab-unavailable'));
  await expect(presentWelcomeOnce(f.deps)).rejects.toThrow('tab-unavailable');
  expect(f.read()).toBeUndefined();
  await expect(presentWelcomeOnce(f.deps)).resolves.toBe(true);
  expect(f.read()).toBe(true);
});

it('retains the durable claim when failed navigation compensation cannot persist', async () => {
  const f = fixture();
  f.deps.open.mockRejectedValueOnce(new Error('tab-unavailable'));
  f.deps.clear.mockRejectedValueOnce(new Error('storage-failed'));
  await expect(presentWelcomeOnce(f.deps)).rejects.toThrow('storage-failed');
  await expect(presentWelcomeOnce(f.deps)).resolves.toBe(false);
  expect(f.deps.open).toHaveBeenCalledOnce();
});

it.each([null, 'true', {}, 1])(
  'refuses malformed first-show state %j without navigation',
  async (value) => {
    const f = fixture(value);
    await expect(presentWelcomeOnce(f.deps)).rejects.toThrow('welcome-state-unavailable');
    expect(f.deps.mark).not.toHaveBeenCalled();
    expect(f.deps.open).not.toHaveBeenCalled();
  }
);

it('finishes an admitted presentation before erasure and cannot recreate the erased marker later', async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred();
  const erased = vi.fn();
  f.deps.open.mockImplementation(async () => {
    entered.resolve();
    await release.promise;
  });
  const presentation = presentWelcomeOnce(f.deps);
  await entered.promise;
  const erasure = runWithPersistentDataErasureBarrier(async () => {
    await f.deps.clear();
    erased();
  });
  expect(erased).not.toHaveBeenCalled();
  release.resolve();
  await Promise.all([presentation, erasure]);
  expect(erased).toHaveBeenCalledOnce();
  expect(f.read()).toBeUndefined();
  expect(f.deps.mark).toHaveBeenCalledOnce();
});

it('uses the canonical local storage adapter and settings entry with a live mutation permit', async () => {
  platform.get.mockResolvedValue({});
  platform.set.mockResolvedValue(undefined);
  platform.create.mockResolvedValue({ id: 1 });
  await expect(presentWelcomeOnce()).resolves.toBe(true);
  expect(platform.get).toHaveBeenCalledWith(['sniptale_welcome_shown']);
  expect(platform.set).toHaveBeenCalledWith({ sniptale_welcome_shown: true }, expect.any(Object));
  expect(platform.create).toHaveBeenCalledWith({
    url: 'chrome-extension://test/apps/extension/src/settings/index.html?welcome=1',
  });
  platform.create.mockRejectedValueOnce(new Error('tab-failed'));
  await expect(presentWelcomeOnce()).rejects.toThrow('tab-failed');
  expect(platform.remove).toHaveBeenCalledWith(['sniptale_welcome_shown'], expect.any(Object));
});
