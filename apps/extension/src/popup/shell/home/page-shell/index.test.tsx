// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  cleanupRenderedNode,
  createActiveTabCapabilities,
  createGalleryStatus,
  createQuickAction,
  getContainer,
  renderNode,
} from './popup-home.test.helpers';

const {
  popupHomeActionRowSpy,
  popupHomeErrorMessageSpy,
  popupHomeQuickActionsSpy,
  runtimeSendMessageSpy,
  usePopupHomeActionsSpy,
} = vi.hoisted(() => ({
  popupHomeActionRowSpy: vi.fn(),
  popupHomeErrorMessageSpy: vi.fn(),
  popupHomeQuickActionsSpy: vi.fn(),
  runtimeSendMessageSpy: vi.fn(),
  usePopupHomeActionsSpy: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
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

vi.mock('./actions', () => ({
  usePopupHomeActions: (args: unknown) => usePopupHomeActionsSpy(args),
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

function getQuickActionsProxyProps() {
  return popupHomeQuickActionsSpy.mock.calls[0]?.[0] as {
    onTriggerAction: (actionId: string) => void;
  };
}

function getActionRowProxyProps() {
  return popupHomeActionRowSpy.mock.calls[0]?.[0] as {
    onOpenScreenshotMode: () => void;
  };
}

function expectRestrictedHomeSections(quickAction: ReturnType<typeof createQuickAction>) {
  expect(usePopupHomeActionsSpy).toHaveBeenCalledWith({
    quickActionsDisabledReason: 'Quick actions blocked',
    screenshotDisabledReason: 'Screenshots blocked',
  });
  expect(popupHomeQuickActionsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      displayMode: 'hidden',
      hasQuickActions: false,
      quickActions: [quickAction],
      quickActionsReady: true,
      quickActionsDisabledTitle: 'popup.common.restrictedPageFeatures',
      shouldShowQuickActions: false,
    })
  );
  expect(popupHomeActionRowSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      galleryStatus: expect.objectContaining({ text: '51 MB used' }),
      screenshotDisabled: true,
      screenshotDisabledTitle: 'popup.common.restrictedPageFeatures',
    })
  );
  expect(getContainer()?.querySelector('[data-testid="error-proxy"]')).toBeNull();
}

async function renderRestrictedHomePage(quickAction: ReturnType<typeof createQuickAction>) {
  await renderNode(
    <PopupHomePage
      quickActions={[quickAction]}
      quickActionsReady
      displayMode="hidden"
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities({
        isRestrictedPage: true,
        quickActions: { reason: 'Quick actions blocked', supported: false },
        screenshotMode: { reason: 'Screenshots blocked', supported: false },
      })}
      galleryStatus={createGalleryStatus({ text: '51 MB used' })}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  popupHomeActionRowSpy.mockReset();
  popupHomeErrorMessageSpy.mockReset();
  popupHomeQuickActionsSpy.mockReset();
  runtimeSendMessageSpy.mockReset();
  runtimeSendMessageSpy.mockResolvedValue({
    status: {
      allSitesGranted: false,
      currentTabActive: true,
      currentTabId: 1,
      currentTabOrigin: 'https://example.com',
      siteGranted: false,
      supported: true,
    },
    success: true,
  });
  usePopupHomeActionsSpy.mockReset();
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

it('maps capability state into home sections and suppresses errors on restricted pages', async () => {
  const handleOpenScreenshotMode = vi.fn();
  const handleQuickAction = vi.fn();

  usePopupHomeActionsSpy.mockReturnValue({
    actionError: 'Quick action failed',
    handleOpenScreenshotMode,
    handleQuickAction,
  });

  const quickAction = createQuickAction({ id: 'quick-action-1' });

  await renderRestrictedHomePage(quickAction);
  expectRestrictedHomeSections(quickAction);

  await act(async () => {
    getQuickActionsProxyProps().onTriggerAction('quick-action-1');
    getActionRowProxyProps().onOpenScreenshotMode();
    await Promise.resolve();
  });

  expect(handleQuickAction).toHaveBeenCalledWith('quick-action-1');
  expect(handleOpenScreenshotMode).toHaveBeenCalled();
});

it('renders the home error surface on unrestricted pages', async () => {
  usePopupHomeActionsSpy.mockReturnValue({
    actionError: 'Open screenshot mode failed',
    handleOpenScreenshotMode: vi.fn(),
    handleQuickAction: vi.fn(),
  });

  await renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady
      displayMode="list"
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
      galleryStatus={null}
    />
  );

  expect(getContainer()?.textContent).toContain('Open screenshot mode failed');
  expect(popupHomeErrorMessageSpy).toHaveBeenCalledWith({
    message: 'Open screenshot mode failed',
  });
});

it('renders bootstrap home errors even when no action handler error is present', async () => {
  await renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady
      displayMode="list"
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
      galleryStatus={null}
      homeError="Failed to load quick actions"
    />
  );

  expect(getContainer()?.textContent).toContain('Failed to load quick actions');
  expect(popupHomeErrorMessageSpy).toHaveBeenCalledWith({
    message: 'Failed to load quick actions',
  });
});

it('forwards the quick-actions readiness state to the section owner', async () => {
  await renderNode(
    <PopupHomePage
      quickActions={[]}
      quickActionsReady={false}
      displayMode="list"
      viewportPresets={[]}
      activeTabCapabilities={createActiveTabCapabilities()}
      galleryStatus={null}
    />
  );

  expect(popupHomeQuickActionsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      quickActionsReady: false,
    })
  );
});
