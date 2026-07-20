import { beforeEach, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const mocks = vi.hoisted(() => ({
  browserPermissionsContainsMock: vi.fn<(query: { origins?: string[] }) => Promise<boolean>>(),
  browserPermissionsGetAllMock: vi.fn(),
  browserPermissionsRemoveMock: vi.fn(),
  browserPermissionsRequestMock: vi.fn(),
  browserScriptingExecuteScriptMock: vi.fn(),
  browserScriptingGetRegisteredContentScriptsMock: vi.fn(),
  browserScriptingRegisterContentScriptsMock: vi.fn(),
  browserScriptingUnregisterContentScriptsMock: vi.fn(),
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
}));

export const {
  browserPermissionsContainsMock,
  browserPermissionsGetAllMock,
  browserPermissionsRemoveMock,
  browserPermissionsRequestMock,
  browserScriptingExecuteScriptMock,
  browserScriptingGetRegisteredContentScriptsMock,
  browserScriptingRegisterContentScriptsMock,
  browserScriptingUnregisterContentScriptsMock,
  browserStorageSessionSetMock,
  browserTabsGetMock,
  sendTabMessageMock,
} = mocks;

const browserStorageSessionGetMock = mocks.browserStorageSessionGetMock;
const browserStorageSessionRemoveMock = mocks.browserStorageSessionRemoveMock;
const browserTabsQueryMock = mocks.browserTabsQueryMock;

export const TEMPORARY_ACTIVE_TABS_STORAGE_KEY = 'sniptale_page_access_active_tabs';
export let sessionStorageState: Record<string, unknown> = {};

vi.mock('@sniptale/platform/browser/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/permissions')>()),
  getMissingOriginPermissions: async (origins: readonly string[]) => {
    const checks = await Promise.all(
      origins.map(async (origin) => ({
        granted: await browserPermissionsContainsMock({ origins: [origin] }),
        origin,
      }))
    );
    return checks.filter((check) => !check.granted).map((check) => check.origin);
  },
  browserPermissions: {
    contains: browserPermissionsContainsMock,
    getAll: browserPermissionsGetAllMock,
    remove: browserPermissionsRemoveMock,
    request: browserPermissionsRequestMock,
    subscribeToAdded: vi.fn(),
    subscribeToRemoved: vi.fn(),
  },
}));

vi.mock('@sniptale/platform/browser/scripting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/scripting')>()),
  browserScripting: {
    executeScript: browserScriptingExecuteScriptMock,
    getRegisteredContentScripts: browserScriptingGetRegisteredContentScriptsMock,
    registerContentScripts: browserScriptingRegisterContentScriptsMock,
    unregisterContentScripts: browserScriptingUnregisterContentScriptsMock,
  },
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: mocks.browserStorageSessionGetMock,
      remove: mocks.browserStorageSessionRemoveMock,
      set: mocks.browserStorageSessionSetMock,
    },
  },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: browserTabsGetMock,
    query: browserTabsQueryMock,
    subscribeToRemoved: vi.fn(),
    subscribeToUpdated: vi.fn(),
  },
}));

vi.mock('../../../platform/runtime-messaging', () => ({
  getErrorMessage: (error: unknown, fallback = 'Unknown error') =>
    error instanceof Error ? error.message : fallback,
  sendTabMessage: mocks.sendTabMessageMock,
}));

export function setSessionStorageState(nextState: Record<string, unknown>): void {
  sessionStorageState = nextState;
}

export function createMessage(operation: PageAccessOperation, tabId = 7) {
  return {
    operation,
    tabId,
    type: MessageType.PAGE_ACCESS,
  };
}

beforeEach(async () => {
  const { clearPageAccessTabActivation } = await import('./service');
  vi.clearAllMocks();
  sessionStorageState = {};
  browserStorageSessionGetMock.mockImplementation(async () => sessionStorageState);
  browserStorageSessionRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete sessionStorageState[key];
    }
  });
  browserStorageSessionSetMock.mockImplementation(async (items: Record<string, unknown>) => {
    sessionStorageState = { ...sessionStorageState, ...items };
  });
  await clearPageAccessTabActivation(7);
  await clearPageAccessTabActivation(8);
  await clearPageAccessTabActivation(9);
  browserPermissionsContainsMock.mockResolvedValue(false);
  browserPermissionsGetAllMock.mockResolvedValue({ origins: [] });
  browserPermissionsRemoveMock.mockResolvedValue(true);
  browserPermissionsRequestMock.mockResolvedValue(true);
  browserScriptingExecuteScriptMock.mockResolvedValue([]);
  browserScriptingGetRegisteredContentScriptsMock.mockResolvedValue([]);
  browserScriptingRegisterContentScriptsMock.mockResolvedValue(undefined);
  browserScriptingUnregisterContentScriptsMock.mockResolvedValue(undefined);
  browserTabsGetMock.mockResolvedValue({ id: 7, url: 'https://example.test/path' });
  browserTabsQueryMock.mockResolvedValue([{ id: 7, url: 'https://example.test/path' }]);
  sendTabMessageMock.mockResolvedValue({
    coords: { x: 0, y: 0, width: 100, height: 100, outerWidth: 100, outerHeight: 100 },
  });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
});
