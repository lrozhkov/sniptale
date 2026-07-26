import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearPageAccessTabActivationMock,
  clearAllPinToTabSessionStorageStateMock,
  reconcilePageAccessTabNavigationMock,
  reconcilePersistentContentScriptRegistrationsMock,
  subscribeToPermissionsRemovedMock,
  subscribeToTabRemovedMock,
  subscribeToTabUpdatedMock,
  unregisterRemovedPageAccessOriginsMock,
} = vi.hoisted(() => ({
  clearPageAccessTabActivationMock: vi.fn(),
  clearAllPinToTabSessionStorageStateMock: vi.fn(),
  reconcilePageAccessTabNavigationMock: vi.fn(),
  reconcilePersistentContentScriptRegistrationsMock: vi.fn(),
  subscribeToPermissionsRemovedMock: vi.fn(),
  subscribeToTabRemovedMock: vi.fn(),
  subscribeToTabUpdatedMock: vi.fn(),
  unregisterRemovedPageAccessOriginsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/permissions')>()),
  browserPermissions: {
    subscribeToRemoved: subscribeToPermissionsRemovedMock,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    subscribeToRemoved: subscribeToTabRemovedMock,
    subscribeToUpdated: subscribeToTabUpdatedMock,
  },
}));

vi.mock('../../../composition/persistence/content-pin-session/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/content-pin-session/index')
  >()),
  clearAllPinToTabSessionStorageState: clearAllPinToTabSessionStorageStateMock,
}));

vi.mock('./registration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./registration')>()),
  reconcilePersistentContentScriptRegistrations: reconcilePersistentContentScriptRegistrationsMock,
}));

vi.mock('./service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./service')>()),
  clearPageAccessTabActivation: clearPageAccessTabActivationMock,
  handlePageAccessMessage: vi.fn(),
  reconcilePageAccessTabNavigation: reconcilePageAccessTabNavigationMock,
  unregisterRemovedPageAccessOrigins: unregisterRemovedPageAccessOriginsMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  reconcilePageAccessTabNavigationMock.mockResolvedValue(undefined);
  reconcilePersistentContentScriptRegistrationsMock.mockResolvedValue(undefined);
});

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

it('reconciles persistent page-access content scripts on lifecycle startup', async () => {
  const { initializePageAccessLifecycle } = await import('./lifecycle');
  initializePageAccessLifecycle();

  expect(reconcilePersistentContentScriptRegistrationsMock).toHaveBeenCalledOnce();
});

it('keeps temporary page access through reload and delegates URL reconciliation to its owner', async () => {
  const { initializePageAccessLifecycle } = await import('./lifecycle');
  initializePageAccessLifecycle();

  subscribeToTabRemovedMock.mock.calls[0]?.[0](7);
  subscribeToTabUpdatedMock.mock.calls[0]?.[0](8, { status: 'loading' });
  subscribeToTabUpdatedMock.mock.calls[0]?.[0](9, { url: 'https://example.test' });
  subscribeToTabUpdatedMock.mock.calls[0]?.[0](10, { title: 'unchanged' });
  subscribeToTabUpdatedMock.mock.calls[0]?.[0](11, { url: 'chrome://settings' });

  expect(clearPageAccessTabActivationMock).toHaveBeenCalledWith(7);
  expect(clearPageAccessTabActivationMock).not.toHaveBeenCalledWith(8);
  expect(clearPageAccessTabActivationMock).not.toHaveBeenCalledWith(9);
  expect(reconcilePageAccessTabNavigationMock).toHaveBeenCalledWith(9, 'https://example.test');
  expect(clearPageAccessTabActivationMock).not.toHaveBeenCalledWith(10);
  expect(clearPageAccessTabActivationMock).toHaveBeenCalledWith(11);
});

it('unregisters dynamic page-access scripts only when removed origins are present', async () => {
  const { initializePageAccessLifecycle } = await import('./lifecycle');
  clearAllPinToTabSessionStorageStateMock.mockResolvedValue(undefined);
  initializePageAccessLifecycle();

  subscribeToPermissionsRemovedMock.mock.calls[0]?.[0]({});
  subscribeToPermissionsRemovedMock.mock.calls[0]?.[0]({
    origins: ['https://example.test/*'],
  });

  await vi.waitFor(() => {
    expect(unregisterRemovedPageAccessOriginsMock).toHaveBeenCalledTimes(1);
    expect(clearAllPinToTabSessionStorageStateMock).toHaveBeenCalledTimes(1);
  });
  expect(unregisterRemovedPageAccessOriginsMock).toHaveBeenCalledWith(['https://example.test/*']);
});

it.each([
  { delayedCleanup: 'pin storage', fastFailure: 'registration removal', tabId: 71 },
  { delayedCleanup: 'registration removal', fastFailure: 'pin storage', tabId: 72 },
] as const)(
  'keeps newer pin work blocked when $fastFailure fails before delayed $delayedCleanup settles',
  async ({ delayedCleanup, fastFailure, tabId }) => {
    const cleanupError = new Error(`${fastFailure} failed`);
    const delayed = createDeferred();
    const events: string[] = [];
    const logger = { warn: vi.fn() };

    if (delayedCleanup === 'pin storage') {
      unregisterRemovedPageAccessOriginsMock.mockRejectedValueOnce(cleanupError);
      clearAllPinToTabSessionStorageStateMock.mockReturnValueOnce(delayed.promise);
    } else {
      unregisterRemovedPageAccessOriginsMock.mockReturnValueOnce(delayed.promise);
      clearAllPinToTabSessionStorageStateMock.mockRejectedValueOnce(cleanupError);
    }

    const { initializePageAccessLifecycle } = await import('./lifecycle');
    const { beginPinnedToolbarOperation, clearPinnedToolbarOperationState } =
      await import('./pinned-toolbar-operation');
    initializePageAccessLifecycle(logger);

    subscribeToPermissionsRemovedMock.mock.calls[0]?.[0]({ origins: ['<all_urls>'] });
    const newerPin = beginPinnedToolbarOperation(tabId).runExclusive(async () => {
      events.push('pin');
    });

    await vi.waitFor(() => {
      expect(unregisterRemovedPageAccessOriginsMock).toHaveBeenCalledOnce();
      expect(clearAllPinToTabSessionStorageStateMock).toHaveBeenCalledOnce();
    });
    expect(events).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();

    delayed.resolve();
    await newerPin;
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to clean pinned toolbar state after permission removal',
        cleanupError
      );
    });
    expect(events).toEqual(['pin']);
    clearPinnedToolbarOperationState(tabId);
  }
);
