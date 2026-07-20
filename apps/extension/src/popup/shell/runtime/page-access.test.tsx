// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { createVideoCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/test-support';
import { usePopupPageAccessRuntime, type PopupPageAccessRuntime } from './page-access';
const {
  browserPermissionsContainsMock,
  browserPermissionsRemoveMock,
  browserPermissionsRequestMock,
  runtimeSendMessageMock,
} = vi.hoisted(() => ({
  browserPermissionsContainsMock: vi.fn(),
  browserPermissionsRemoveMock: vi.fn(),
  browserPermissionsRequestMock: vi.fn(),
  runtimeSendMessageMock: vi.fn(),
}));
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
    contains: (...args: unknown[]) => browserPermissionsContainsMock(...args),
    remove: (...args: unknown[]) => browserPermissionsRemoveMock(...args),
    request: (...args: unknown[]) => browserPermissionsRequestMock(...args),
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: () => ({
    sendRuntimeMessage: (...args: unknown[]) => runtimeSendMessageMock(...args),
  }),
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

const inactiveStatus = {
  allSitesGranted: false,
  currentTabActive: false,
  currentTabId: 7,
  currentTabOrigin: 'https://example.test',
  siteGranted: false,
  supported: true,
} as const;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestRuntime: PopupPageAccessRuntime | null = null;

function createCapabilities(overrides: Partial<ActiveTabCapabilities> = {}): ActiveTabCapabilities {
  const supported = { supported: true, reason: null };
  return {
    export: supported,
    isRestrictedPage: false,
    quickActions: supported,
    restrictedPageLabel: null,
    screenshotMode: supported,
    tabId: 7,
    title: 'Example',
    url: 'https://example.test/page',
    videoByMode: createVideoCapabilities(supported),
    ...overrides,
  };
}

function Harness(props: { capabilities?: ActiveTabCapabilities | undefined }) {
  latestRuntime = usePopupPageAccessRuntime(props.capabilities ?? createCapabilities());
  return null;
}

async function renderHarness(capabilities?: ActiveTabCapabilities) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness capabilities={capabilities} />));
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  browserPermissionsContainsMock.mockReset().mockResolvedValue(false);
  browserPermissionsRemoveMock.mockReset().mockResolvedValue(true);
  browserPermissionsRequestMock.mockReset().mockResolvedValue(true);
  runtimeSendMessageMock.mockReset();
  runtimeSendMessageMock.mockResolvedValue({ status: inactiveStatus, success: true });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  latestRuntime = null;
  vi.unstubAllGlobals();
});

it('loads status for the active supported tab', async () => {
  await renderHarness();
  await flushAsync();

  expect(runtimeSendMessageMock).toHaveBeenCalledWith({
    operation: 'read-status',
    tabId: 7,
    type: 'PAGE_ACCESS',
  });
  expect(latestRuntime?.disabledReason).toBe('popup.home.pageAccessRequired');
});

it('requests all-sites permission during the popup gesture before registration', async () => {
  runtimeSendMessageMock
    .mockResolvedValueOnce({ status: inactiveStatus, success: true })
    .mockResolvedValueOnce({
      status: { ...inactiveStatus, allSitesGranted: true, currentTabActive: true },
      success: true,
    });

  await renderHarness();
  await flushAsync();

  await act(async () => {
    await latestRuntime?.handleRequest('grant-all-sites');
  });

  expect(browserPermissionsRequestMock).toHaveBeenCalledWith({
    origins: ['<all_urls>'],
  });
  expect(runtimeSendMessageMock).toHaveBeenLastCalledWith({
    operation: 'register-granted-all-sites',
    tabId: 7,
    type: 'PAGE_ACCESS',
  });
});

it('requests current-site permission during the popup gesture before registration', async () => {
  runtimeSendMessageMock
    .mockResolvedValueOnce({ status: inactiveStatus, success: true })
    .mockResolvedValueOnce({
      status: { ...inactiveStatus, currentTabActive: true, siteGranted: true },
      success: true,
    });

  await renderHarness();
  await flushAsync();

  await act(async () => {
    await latestRuntime?.handleRequest('grant-site');
  });

  expect(browserPermissionsRequestMock).toHaveBeenCalledWith({
    origins: ['https://example.test/*'],
  });
  expect(runtimeSendMessageMock).toHaveBeenLastCalledWith({
    operation: 'register-granted-site',
    tabId: 7,
    type: 'PAGE_ACCESS',
  });
});

it('rejects stale site grants before requesting an origin permission', async () => {
  runtimeSendMessageMock.mockResolvedValueOnce({ status: inactiveStatus, success: true });

  await renderHarness();
  await flushAsync();

  await act(async () => {
    root?.render(<Harness capabilities={createCapabilities({ tabId: 8 })} />);
  });

  await act(async () => {
    await latestRuntime?.handleRequest('grant-site');
  });

  expect(browserPermissionsRequestMock).not.toHaveBeenCalled();
  expect(latestRuntime?.error).toBe('popup.home.pageAccessFailed');
});

it('rolls back a just-granted site permission when background registration fails', async () => {
  runtimeSendMessageMock
    .mockResolvedValueOnce({ status: inactiveStatus, success: true })
    .mockResolvedValueOnce({
      error: 'registration failed',
      status: inactiveStatus,
      success: false,
    });

  await renderHarness();
  await flushAsync();

  await act(async () => {
    await latestRuntime?.handleRequest('grant-site');
  });

  expect(browserPermissionsRequestMock).toHaveBeenCalledWith({
    origins: ['https://example.test/*'],
  });
  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({
    origins: ['https://example.test/*'],
  });
  expect(latestRuntime?.error).toBe('registration failed');
});

it('rolls back a just-granted site permission when background registration rejects', async () => {
  runtimeSendMessageMock
    .mockResolvedValueOnce({ status: inactiveStatus, success: true })
    .mockRejectedValueOnce(new Error('registration rejected'));

  await renderHarness();
  await flushAsync();

  await act(async () => {
    await latestRuntime?.handleRequest('grant-site');
  });

  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({
    origins: ['https://example.test/*'],
  });
  expect(latestRuntime?.error).toBe('registration rejected');
});

it('rolls back a just-granted all-sites permission when background registration fails', async () => {
  runtimeSendMessageMock
    .mockResolvedValueOnce({ status: inactiveStatus, success: true })
    .mockResolvedValueOnce({
      error: 'all-sites registration failed',
      status: inactiveStatus,
      success: false,
    });

  await renderHarness();
  await flushAsync();

  await act(async () => {
    await latestRuntime?.handleRequest('grant-all-sites');
  });

  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({
    origins: ['<all_urls>'],
  });
  expect(latestRuntime?.error).toBe('all-sites registration failed');
});

it('does not roll back pre-existing all-sites permission after registration failure', async () => {
  browserPermissionsContainsMock.mockImplementation(
    async (query: { origins?: string[] }) => query.origins?.[0] === '<all_urls>'
  );
  runtimeSendMessageMock
    .mockResolvedValueOnce({ status: inactiveStatus, success: true })
    .mockResolvedValueOnce({
      error: 'all-sites registration failed',
      status: inactiveStatus,
      success: false,
    });

  await renderHarness();
  await flushAsync();

  await act(async () => {
    await latestRuntime?.handleRequest('grant-all-sites');
  });

  expect(browserPermissionsRequestMock).not.toHaveBeenCalled();
  expect(browserPermissionsRemoveMock).not.toHaveBeenCalled();
});

it('rolls back a just-granted all-sites permission when background registration rejects', async () => {
  runtimeSendMessageMock
    .mockResolvedValueOnce({ status: inactiveStatus, success: true })
    .mockRejectedValueOnce(new Error('all-sites registration rejected'));

  await renderHarness();
  await flushAsync();

  await act(async () => {
    await latestRuntime?.handleRequest('grant-all-sites');
  });

  expect(browserPermissionsRemoveMock).toHaveBeenCalledWith({
    origins: ['<all_urls>'],
  });
  expect(latestRuntime?.error).toBe('all-sites registration rejected');
});
