import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearPageAccessTabActivationMock,
  reconcilePageAccessTabNavigationMock,
  reconcilePersistentContentScriptRegistrationsMock,
  subscribeToPermissionsRemovedMock,
  subscribeToTabRemovedMock,
  subscribeToTabUpdatedMock,
  unregisterRemovedPageAccessOriginsMock,
} = vi.hoisted(() => ({
  clearPageAccessTabActivationMock: vi.fn(),
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
  initializePageAccessLifecycle();

  subscribeToPermissionsRemovedMock.mock.calls[0]?.[0]({});
  subscribeToPermissionsRemovedMock.mock.calls[0]?.[0]({
    origins: ['https://example.test/*'],
  });

  await vi.waitFor(() => {
    expect(unregisterRemovedPageAccessOriginsMock).toHaveBeenCalledTimes(1);
  });
  expect(unregisterRemovedPageAccessOriginsMock).toHaveBeenCalledWith(['https://example.test/*']);
});

it('keeps newer pin work blocked until permission cleanup settles', async () => {
  const tabId = 71;
  const delayed = createDeferred();
  const events: string[] = [];
  const logger = { warn: vi.fn() };

  unregisterRemovedPageAccessOriginsMock.mockReturnValueOnce(delayed.promise);

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
  });
  expect(events).toEqual([]);
  expect(logger.warn).not.toHaveBeenCalled();

  delayed.resolve();
  await newerPin;
  expect(logger.warn).not.toHaveBeenCalled();
  expect(events).toEqual(['pin']);
  clearPinnedToolbarOperationState(tabId);
});
