import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearPageAccessTabActivationMock,
  clearAllPinToTabSessionStorageStateMock,
  reconcilePersistentContentScriptRegistrationsMock,
  subscribeToPermissionsRemovedMock,
  subscribeToTabRemovedMock,
  subscribeToTabUpdatedMock,
  unregisterRemovedPageAccessOriginsMock,
} = vi.hoisted(() => ({
  clearPageAccessTabActivationMock: vi.fn(),
  clearAllPinToTabSessionStorageStateMock: vi.fn(),
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
  unregisterRemovedPageAccessOrigins: unregisterRemovedPageAccessOriginsMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  reconcilePersistentContentScriptRegistrationsMock.mockResolvedValue(undefined);
});

it('reconciles persistent page-access content scripts on lifecycle startup', async () => {
  const { initializePageAccessLifecycle } = await import('./lifecycle');
  initializePageAccessLifecycle();

  expect(reconcilePersistentContentScriptRegistrationsMock).toHaveBeenCalledOnce();
});

it('clears temporary page access when tabs are removed or navigated', async () => {
  const { initializePageAccessLifecycle } = await import('./lifecycle');
  initializePageAccessLifecycle();

  subscribeToTabRemovedMock.mock.calls[0]?.[0](7);
  subscribeToTabUpdatedMock.mock.calls[0]?.[0](8, { status: 'loading' });
  subscribeToTabUpdatedMock.mock.calls[0]?.[0](9, { url: 'https://example.test' });
  subscribeToTabUpdatedMock.mock.calls[0]?.[0](10, { title: 'unchanged' });

  expect(clearPageAccessTabActivationMock).toHaveBeenCalledWith(7);
  expect(clearPageAccessTabActivationMock).toHaveBeenCalledWith(8);
  expect(clearPageAccessTabActivationMock).toHaveBeenCalledWith(9);
  expect(clearPageAccessTabActivationMock).not.toHaveBeenCalledWith(10);
});

it('unregisters dynamic page-access scripts only when removed origins are present', async () => {
  const { initializePageAccessLifecycle } = await import('./lifecycle');
  clearAllPinToTabSessionStorageStateMock.mockResolvedValue(undefined);
  initializePageAccessLifecycle();

  subscribeToPermissionsRemovedMock.mock.calls[0]?.[0]({});
  subscribeToPermissionsRemovedMock.mock.calls[0]?.[0]({
    origins: ['https://example.test/*'],
  });

  expect(unregisterRemovedPageAccessOriginsMock).toHaveBeenCalledTimes(1);
  expect(unregisterRemovedPageAccessOriginsMock).toHaveBeenCalledWith(['https://example.test/*']);
  expect(clearAllPinToTabSessionStorageStateMock).toHaveBeenCalledTimes(1);
});
