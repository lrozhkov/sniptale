// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { usePopupSettingsForm } from './index';
import {
  installPopupRuntimeMessagingMock,
  resetPopupRuntimeMessagingMock,
} from '../../shell/runtime/services.test-support';

const {
  browserTabsCreateMock,
  browserTabsQueryMock,
  getUrlMock,
  sendRuntimeMessageMock,
  sendTabMessageMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  getUrlMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    create: browserTabsCreateMock,
    query: browserTabsQueryMock,
  },
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: getUrlMock,
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
  },
}));

let container: HTMLDivElement | null = null;
let latestState: ReturnType<typeof usePopupSettingsForm> | null = null;
let root: Root | null = null;

function PopupSettingsHarness() {
  latestState = usePopupSettingsForm();
  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PopupSettingsHarness />);
  });
  await flushEffects();
}

function getState() {
  if (!latestState) {
    throw new Error('Popup settings state is not ready');
  }

  return latestState;
}

async function toggleScreenshotMode() {
  await act(async () => {
    await getState().toggleScreenshotMode();
  });
}

async function toggleToolbar() {
  await act(async () => {
    await getState().toggleToolbar();
  });
}

async function verifiesToggleFailures() {
  browserTabsQueryMock
    .mockResolvedValueOnce([{}])
    .mockResolvedValueOnce([{}])
    .mockResolvedValueOnce([{}])
    .mockResolvedValueOnce([{ id: 21 }]);
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: false,
    error: 'Custom mode error',
  });
  sendTabMessageMock.mockResolvedValueOnce({
    success: false,
    error: 'Custom toolbar error',
  });

  await renderHarness();

  await toggleScreenshotMode();

  expect(toastErrorMock).toHaveBeenCalledWith('popup.settingsForm.noActiveTab');
  expect(getState().isToggling).toBe(false);

  await toggleToolbar();

  expect(toastErrorMock).toHaveBeenCalledWith('popup.settingsForm.noActiveTab');
  expect(getState().isTogglingToolbar).toBe(false);

  browserTabsQueryMock.mockResolvedValue([{ id: 21 }]);

  await toggleScreenshotMode();
  await toggleToolbar();

  expect(toastErrorMock).toHaveBeenCalledWith('Custom mode error');
  expect(toastErrorMock).toHaveBeenCalledWith('Custom toolbar error');
}

async function verifiesStaleRuntimeFailures() {
  browserTabsQueryMock
    .mockResolvedValueOnce([{ id: 21 }])
    .mockResolvedValueOnce([{ id: 21 }])
    .mockResolvedValueOnce([{ id: 21 }])
    .mockResolvedValueOnce([{ id: 21 }]);
  sendRuntimeMessageMock
    .mockResolvedValueOnce({ success: true, enabled: false })
    .mockResolvedValueOnce({
      success: false,
      error: 'Could not establish connection. Receiving end does not exist.',
    });
  sendTabMessageMock
    .mockResolvedValueOnce({ success: true, visible: false })
    .mockResolvedValueOnce({
      success: false,
      error: 'Could not establish connection. Receiving end does not exist.',
    });

  await renderHarness();

  await toggleScreenshotMode();
  await toggleToolbar();

  expect(toastErrorMock).toHaveBeenCalledWith('popup.common.stalePageRuntimeHint');
  expect(toastErrorMock).toHaveBeenCalledTimes(2);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  browserTabsCreateMock.mockReset();
  browserTabsQueryMock.mockReset();
  getUrlMock.mockReset();
  sendRuntimeMessageMock.mockReset();
  sendTabMessageMock.mockReset();
  installPopupRuntimeMessagingMock(sendRuntimeMessageMock, sendTabMessageMock);
  toastErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
  resetPopupRuntimeMessagingMock();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('usePopupSettingsForm status sync', () => {
  it('syncs screenshot mode and toolbar status on mount and window focus', async () => {
    browserTabsQueryMock
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValueOnce([{ id: 7 }]);
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true, enabled: true })
      .mockResolvedValueOnce({ success: true, enabled: false });
    sendTabMessageMock
      .mockResolvedValueOnce({ success: true, visible: true })
      .mockResolvedValueOnce({ success: true, visible: false });

    await renderHarness();

    expect(getState().screenshotMode).toBe(true);
    expect(getState().showToolbar).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await flushEffects();

    expect(getState().screenshotMode).toBe(false);
    expect(getState().showToolbar).toBe(false);
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      type: MessageType.SCREENSHOT_MODE_STATUS,
      tabId: 7,
    });
    expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
      type: MessageType.TOOLBAR_STATUS,
      tabId: 7,
    });
  });

  it('skips the initial status sync when there is no active tab', async () => {
    browserTabsQueryMock.mockResolvedValue([{}]);

    await renderHarness();

    expect(getState().screenshotMode).toBe(false);
    expect(getState().showToolbar).toBe(false);
    expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
    expect(sendTabMessageMock).not.toHaveBeenCalled();
  });
});

describe('usePopupSettingsForm actions', () => {
  it('toggles screenshot mode, toggles the toolbar, and opens the settings page', async () => {
    browserTabsQueryMock
      .mockResolvedValueOnce([{ id: 12 }])
      .mockResolvedValueOnce([{ id: 12 }])
      .mockResolvedValueOnce([{ id: 12 }])
      .mockResolvedValueOnce([{ id: 12 }]);
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true, enabled: false })
      .mockResolvedValueOnce({ success: true });
    sendTabMessageMock
      .mockResolvedValueOnce({ success: true, visible: false })
      .mockResolvedValueOnce({ success: true });
    getUrlMock.mockReturnValue('chrome-extension://id/apps/extension/src/settings/index.html');

    await renderHarness();

    await act(async () => {
      await getState().toggleScreenshotMode();
    });

    expect(getState().screenshotMode).toBe(true);
    expect(getState().isToggling).toBe(false);
    expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      tabId: 12,
    });

    await act(async () => {
      await getState().toggleToolbar();
    });

    expect(getState().showToolbar).toBe(true);
    expect(getState().isTogglingToolbar).toBe(false);
    expect(sendTabMessageMock).toHaveBeenLastCalledWith(12, {
      type: MessageType.SHOW_TOOLBAR,
      tabId: 12,
    });

    act(() => {
      getState().openSettingsPage();
    });

    expect(getUrlMock).toHaveBeenCalledWith('apps/extension/src/settings/index.html');
    expect(browserTabsCreateMock).toHaveBeenCalledWith({
      url: 'chrome-extension://id/apps/extension/src/settings/index.html',
    });
  });
});

function runPopupSettingsFailureHandlingSuite() {
  it('alerts for missing active tabs and surfaced toggle failures', verifiesToggleFailures);
  it('normalizes stale page runtime failures into a refresh hint', verifiesStaleRuntimeFailures);
}

describe('usePopupSettingsForm failure handling', runPopupSettingsFailureHandlingSuite);
