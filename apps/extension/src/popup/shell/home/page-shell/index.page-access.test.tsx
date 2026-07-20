// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  cleanupRenderedNode,
  createActiveTabCapabilities,
  getContainer,
  renderNode,
} from './popup-home.test.helpers';

const {
  popupHomeActionRowSpy,
  popupHomeErrorMessageSpy,
  popupHomeQuickActionsSpy,
  permissionsRequestSpy,
  runtimeSendMessageSpy,
  pageAccessHandleRequestSpy,
  usePopupHomeActionsSpy,
} = vi.hoisted(() => ({
  popupHomeActionRowSpy: vi.fn(),
  popupHomeErrorMessageSpy: vi.fn(),
  popupHomeQuickActionsSpy: vi.fn(),
  permissionsRequestSpy: vi.fn(),
  runtimeSendMessageSpy: vi.fn(),
  pageAccessHandleRequestSpy: vi.fn(),
  usePopupHomeActionsSpy: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./actions', () => ({
  usePopupHomeActions: (args: unknown) => usePopupHomeActionsSpy(args),
}));

vi.mock('@sniptale/platform/browser/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/permissions')>()),
  browserPermissions: {
    request: permissionsRequestSpy,
  },
}));

vi.mock('./sections', () => ({
  GalleryStatus: undefined,
  PopupHomeActionRow: (props: unknown) => {
    popupHomeActionRowSpy(props);
    return <button data-testid="action-row-proxy">action-row</button>;
  },
  PopupHomeErrorMessage: (props: { message: string }) => {
    popupHomeErrorMessageSpy(props);
    return <div data-testid="error-proxy">{props.message}</div>;
  },
  PopupHomeQuickActions: (props: unknown) => {
    popupHomeQuickActionsSpy(props);
    return <button data-testid="quick-actions-proxy">quick-actions</button>;
  },
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: () => ({
    sendRuntimeMessage: runtimeSendMessageSpy,
  }),
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

import { PopupHomePage } from './index';

const inactiveStatus = {
  allSitesGranted: false,
  currentTabActive: false,
  currentTabId: 1,
  currentTabOrigin: 'https://example.com',
  siteGranted: false,
  supported: true,
};

function renderPopupHomePage(
  pageAccess: Partial<Parameters<typeof PopupHomePage>[0]['pageAccess']> = {}
) {
  return renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady
      displayMode="list"
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
      galleryStatus={null}
      pageAccess={{
        disabledReason: 'popup.home.pageAccessRequired',
        error: null,
        handleRequest: pageAccessHandleRequestSpy,
        loading: false,
        pendingOperation: null,
        status: inactiveStatus,
        ...pageAccess,
      }}
    />
  );
}

function findButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(getContainer()?.querySelectorAll('button') ?? []).find((element) =>
    element.textContent?.includes(text)
  );
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  popupHomeActionRowSpy.mockReset();
  popupHomeErrorMessageSpy.mockReset();
  popupHomeQuickActionsSpy.mockReset();
  permissionsRequestSpy.mockReset();
  permissionsRequestSpy.mockResolvedValue(true);
  runtimeSendMessageSpy.mockReset();
  runtimeSendMessageSpy.mockResolvedValue({
    status: {
      ...inactiveStatus,
      currentTabActive: true,
    },
    success: true,
  });
  usePopupHomeActionsSpy.mockReset();
  pageAccessHandleRequestSpy.mockReset();
  pageAccessHandleRequestSpy.mockResolvedValue(undefined);
  usePopupHomeActionsSpy.mockReturnValue({
    actionError: null,
    handleOpenScreenshotMode: vi.fn(),
    handleQuickAction: vi.fn(),
  });
});

afterEach(() => {
  cleanupRenderedNode();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('shows page-access activation controls when page tooling is not active', async () => {
  await renderPopupHomePage();

  expect(getContainer()?.textContent).toContain('popup.home.enableForTab');
  expect(getContainer()?.textContent).toContain('popup.home.alwaysEnableSite');
  expect(getContainer()?.textContent).toContain('popup.home.alwaysEnableAllSites');
  expect(usePopupHomeActionsSpy).toHaveBeenLastCalledWith({
    quickActionsDisabledReason: 'popup.home.pageAccessRequired',
    screenshotDisabledReason: 'popup.home.pageAccessRequired',
  });
});

it('renders page-access status load failures without keeping actions disabled', async () => {
  await renderPopupHomePage({
    disabledReason: null,
    error: 'status failed',
    status: null,
  });

  expect(getContainer()?.textContent).toContain('status failed');
  expect(usePopupHomeActionsSpy).toHaveBeenLastCalledWith({
    quickActionsDisabledReason: null,
    screenshotDisabledReason: null,
  });
});

it('surfaces page-access request failures after an activation action', async () => {
  await renderPopupHomePage({ error: 'activation denied' });
  await act(async () => {
    findButtonByText('popup.home.enableForTab').click();
    await Promise.resolve();
  });

  expect(getContainer()?.textContent).toContain('activation denied');
  expect(pageAccessHandleRequestSpy).toHaveBeenCalledWith('activate-current-tab');
  expect(usePopupHomeActionsSpy).toHaveBeenLastCalledWith({
    quickActionsDisabledReason: 'popup.home.pageAccessRequired',
    screenshotDisabledReason: 'popup.home.pageAccessRequired',
  });
});

it('requests all-sites permission in the popup gesture before background registration', async () => {
  await renderPopupHomePage();
  await act(async () => {
    findButtonByText('popup.home.alwaysEnableAllSites').click();
    await Promise.resolve();
  });

  expect(pageAccessHandleRequestSpy).toHaveBeenCalledWith('grant-all-sites');
});

it('requests site permission in the popup gesture before background registration', async () => {
  await renderPopupHomePage();
  await act(async () => {
    findButtonByText('popup.home.alwaysEnableSite').click();
    await Promise.resolve();
  });

  expect(pageAccessHandleRequestSpy).toHaveBeenCalledWith('grant-site');
});

it('does not read page-access status for restricted tabs', async () => {
  await renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady
      displayMode="list"
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities({ isRestrictedPage: true })}
      galleryStatus={null}
    />
  );

  expect(runtimeSendMessageSpy).not.toHaveBeenCalled();
});
