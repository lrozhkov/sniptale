// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { normalizePageLaunchPreferences } from '../../../contracts/page-launch';
const mocks = vi.hoisted(() => ({
  full: vi.fn(() => false),
  release: vi.fn(),
  wake: vi.fn(),
  load: vi.fn(),
  actions: vi.fn(),
  view: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  hotkeys: vi.fn(),
  subscribe: vi.fn(),
  open: vi.fn(),
  trigger: vi.fn(),
  save: vi.fn(),
  dispose: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/content-runtime-shim', () => ({
  contentRuntimeShimBrowser: {
    canObserveStorageChanges: () => true,
    subscribeToStorageChanges: mocks.subscribe,
  },
}));
vi.mock('./preferences', () => ({ createShimPreferencesLoader: () => mocks.load }));
vi.mock('./launcher', () => ({ createShimLauncher: mocks.view }));
vi.mock('../entrypoint/markers', () => ({
  isFullContentRuntimeMounted: mocks.full,
  requestFullContentRuntimeRelease: mocks.release,
}));
vi.mock('./quick-actions', () => ({
  loadShimQuickActions: mocks.actions,
  shimQuickActionStorage: {},
}));
vi.mock('./transport/wakeup', () => ({ wakeContentRuntimeFromShim: mocks.wake }));
vi.mock('./transport/launcher', () => ({
  openPageToolbarFromShim: mocks.open,
  savePageCornerFromShim: mocks.save,
}));
vi.mock('./transport/quick-action', () => ({ triggerQuickActionFromShim: mocks.trigger }));
vi.mock('../../platform/quick-action-hotkeys', () => ({
  createQuickActionHotkeyRuntime: mocks.hotkeys,
}));
type ShimGlobal = typeof globalThis & { __sniptaleContentRuntimeShimCleanup?: () => void };
const runtime = globalThis as ShimGlobal;
async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
async function mutation() {
  document.body.append(document.createElement('span'));
  await flush();
}
function presentation() {
  return {
    preferences: { ...normalizePageLaunchPreferences(undefined), enabled: true },
    locale: 'en',
    theme: 'light',
  };
}
beforeEach(() => {
  runtime.__sniptaleContentRuntimeShimCleanup?.();
  vi.resetModules();
  vi.clearAllMocks();
  mocks.full.mockReturnValue(false);
  mocks.release.mockResolvedValue(false);
  mocks.wake.mockResolvedValue({ success: true });
  mocks.load.mockResolvedValue(presentation());
  mocks.actions.mockResolvedValue([]);
  mocks.subscribe.mockReturnValue(vi.fn());
  mocks.view.mockReturnValue({ dispose: mocks.dispose, update: mocks.update });
  mocks.hotkeys.mockReturnValue({ start: mocks.start, stop: mocks.stop });
  mocks.open.mockResolvedValue(undefined);
});
afterEach(() => {
  runtime.__sniptaleContentRuntimeShimCleanup?.();
  document.body.replaceChildren();
});
it('waits for passive wakeup before showing launcher and gives restored full runtime priority', async () => {
  let wake!: () => void;
  mocks.wake.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        wake = resolve;
      })
  );
  await import('.');
  await flush();
  expect(mocks.view).not.toHaveBeenCalled();
  mocks.full.mockReturnValue(true);
  wake();
  await flush();
  expect(mocks.view).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
});
it('restarts one shim owner only after full cleanup without repeating passive wakeup', async () => {
  await import('.');
  await flush();
  expect(mocks.start).toHaveBeenCalledOnce();
  expect(mocks.view).toHaveBeenCalledOnce();
  mocks.full.mockReturnValue(true);
  await mutation();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(mocks.stop).toHaveBeenCalledOnce();
  mocks.full.mockReturnValue(false);
  await mutation();
  expect(mocks.hotkeys).toHaveBeenCalledTimes(2);
  expect(mocks.view).toHaveBeenCalledTimes(2);
  expect(mocks.wake).toHaveBeenCalledOnce();
  await mutation();
  expect(mocks.view).toHaveBeenCalledTimes(2);
});
it('observes handback even when initialized with an existing full runtime', async () => {
  mocks.full.mockReturnValue(true);
  await import('.');
  await flush();
  expect(mocks.wake).not.toHaveBeenCalled();
  expect(mocks.view).not.toHaveBeenCalled();
  mocks.full.mockReturnValue(false);
  await mutation();
  expect(mocks.view).toHaveBeenCalledOnce();
});
it('coalesces opening and returns one retryable launcher after supported post-injection failure', async () => {
  await import('.');
  await flush();
  let refuse!: (reason: Error) => void;
  mocks.open.mockImplementationOnce(
    () =>
      new Promise<void>((_, reject) => {
        refuse = reject;
      })
  );
  const options = mocks.view.mock.calls[0]![0];
  const first = options.open();
  const duplicate = options.open();
  mocks.full.mockReturnValue(true);
  await mutation();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  mocks.release.mockImplementationOnce(async () => {
    mocks.full.mockReturnValue(false);
    await mutation();
    return true;
  });
  refuse(new Error('Native rollback completed'));
  await expect(first).rejects.toThrow('Native rollback');
  await duplicate;
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(mocks.view).toHaveBeenCalledTimes(2);
  expect(mocks.view.mock.calls[1]![0].failed).toBe(true);
  await mocks.view.mock.calls[1]![0].open();
  expect(mocks.open).toHaveBeenCalledTimes(2);
});
it('discards a late read after reinjection and never writes defaults while opening', async () => {
  let old!: (value: ReturnType<typeof presentation>) => void;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        old = resolve;
      })
  );
  await import('.');
  runtime.__sniptaleContentRuntimeShimCleanup?.();
  old(presentation());
  await flush();
  expect(mocks.view).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('latest storage reload wins over an older completed read', async () => {
  await import('.');
  await flush();
  let old!: (value: ReturnType<typeof presentation>) => void;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        old = resolve;
      })
  );
  const changed = mocks.subscribe.mock.calls[0]![0];
  changed();
  const newest = presentation();
  newest.preferences.corner = 'top-left';
  mocks.load.mockResolvedValue(newest);
  changed();
  await flush();
  old(presentation());
  await flush();
  expect(mocks.update.mock.calls.at(-1)![0].presentation.preferences.corner).toBe('top-left');
});

it('keeps the full runtime after quick-action startup until its capture owner completes', async () => {
  await import('.');
  await flush();
  let finish!: () => void;
  mocks.trigger.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const command = mocks.view.mock.calls[0]![0].trigger({
    id: 'capture',
    status: true,
    hotkey: null,
  });
  mocks.full.mockReturnValue(true);
  await mutation();
  expect(mocks.release).not.toHaveBeenCalled();
  finish();
  await command;
  expect(mocks.release).not.toHaveBeenCalled();
  expect(mocks.full()).toBe(true);
  expect(mocks.view).toHaveBeenCalledOnce();
});
it('returns a retryable group after failed quick action rollback', async () => {
  await import('.');
  await flush();
  mocks.trigger.mockImplementationOnce(async () => {
    mocks.full.mockReturnValue(true);
    await mutation();
    throw new Error('capture refused');
  });
  mocks.release.mockImplementationOnce(async () => {
    mocks.full.mockReturnValue(false);
    return true;
  });
  await expect(
    mocks.view.mock.calls[0]![0].trigger({ id: 'capture', status: true, hotkey: null })
  ).rejects.toThrow('capture refused');
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(mocks.view).toHaveBeenCalledTimes(2);
  expect(mocks.view.mock.calls[1]![0].failed).toBe(true);
});
