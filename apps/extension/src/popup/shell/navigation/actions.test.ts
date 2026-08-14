// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  captureDesktopScreenshotFrameMock: vi.fn(),
  chooseDesktopScreenshotSourceMock: vi.fn(),
  getActiveTabIdMock: vi.fn(async () => 42),
  getUrlMock: vi.fn((relativePath: string) => `chrome-extension://test/${relativePath}`),
  sendRuntimeMessageMock: vi.fn(),
  translateMock: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('../../../platform/media-utils/desktop-screenshot-frame', () => ({
  captureDesktopScreenshotFrame: mocks.captureDesktopScreenshotFrameMock,
}));

vi.mock('../../../platform/media-utils/desktop-capture-source-picker', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../platform/media-utils/desktop-capture-source-picker')
  >()),
  chooseDesktopScreenshotSource: mocks.chooseDesktopScreenshotSourceMock,
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: mocks.getUrlMock,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: {
    create: mocks.browserTabsCreateMock,
  },
}));

vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: () => 'editor://root',
}));

vi.mock('../../../platform/navigation/extension-pages/scenario-editor', () => ({
  buildScenarioEditorUrl: () => 'scenario-editor://root',
}));

vi.mock('../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/popup')>()),
  translate: mocks.translateMock,
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: mocks.sendRuntimeMessageMock,
}));

vi.mock('../tab-access', () => ({
  getActiveTabId: mocks.getActiveTabIdMock,
}));

import {
  openDesignSystem,
  openGallery,
  openGithubRepository,
  openImageEditor,
  openScenarioEditor,
  openScreenshotMode,
  openSettings,
  openVideoEditor,
  triggerQuickAction,
  triggerScreenshotCapture,
} from './actions';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installPopupRuntimeMessagingMock } from '../runtime/services.test-support';

function resetPopupUtilsMocks() {
  mocks.browserTabsCreateMock.mockReset();
  mocks.chooseDesktopScreenshotSourceMock.mockReset();
  mocks.captureDesktopScreenshotFrameMock.mockReset();
  mocks.getActiveTabIdMock.mockClear();
  mocks.getUrlMock.mockClear();
  mocks.sendRuntimeMessageMock.mockReset();
  mocks.translateMock.mockClear();
  installPopupRuntimeMessagingMock(mocks.sendRuntimeMessageMock);
  vi.restoreAllMocks();
  vi.stubGlobal('close', vi.fn());
}

async function verifiesPopupOwnedDesktopSelection() {
  mocks.captureDesktopScreenshotFrameMock.mockResolvedValue({
    dataUrl: 'data:image/webp;base64,AA==',
    width: 1200,
    height: 800,
  });
  mocks.chooseDesktopScreenshotSourceMock.mockResolvedValue({
    status: 'selected',
    selection: { label: 'Window', streamId: 'popup-desktop-stream' },
  });
  mocks.sendRuntimeMessageMock.mockImplementation(async (message: { type: string }) =>
    message.type === MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE
      ? {
          success: true,
          result: 'ready',
          imageFormat: 'webp',
          imageQuality: 72,
          requestId: 'desktop-request',
          reservationToken: 'desktop-reservation',
        }
      : { success: true }
  );
  const config = {
    screenshotMode: 'desktop' as const,
    viewportPresetId: null,
    delay: null,
    afterCapture: 'download_default' as const,
    imageFormat: null,
    imageQuality: null,
    exitAfterCapture: false,
  };

  await triggerQuickAction('desktop-action', true);
  await triggerScreenshotCapture(config);

  expect(mocks.chooseDesktopScreenshotSourceMock).toHaveBeenCalledTimes(2);
  expect(mocks.chooseDesktopScreenshotSourceMock).toHaveBeenCalledWith();
  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
    type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE,
    actionId: 'desktop-action',
    tabId: 42,
  });
  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
    type: MessageType.TRIGGER_QUICK_ACTION,
    actionId: 'desktop-action',
    desktopSelection: {
      requestId: 'desktop-request',
      reservationToken: 'desktop-reservation',
      status: 'selected',
      dataUrl: 'data:image/webp;base64,AA==',
      width: 1200,
      height: 800,
    },
    tabId: 42,
  });
  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(3, {
    type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE,
    config,
    tabId: 42,
  });
  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(4, {
    type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
    config,
    desktopSelection: {
      requestId: 'desktop-request',
      reservationToken: 'desktop-reservation',
      status: 'selected',
      dataUrl: 'data:image/webp;base64,AA==',
      width: 1200,
      height: 800,
    },
    tabId: 42,
  });
  expect(mocks.sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ desktopStreamId: expect.any(String) })
  );
  expect(mocks.captureDesktopScreenshotFrameMock).toHaveBeenCalledTimes(2);
  expect(mocks.captureDesktopScreenshotFrameMock).toHaveBeenCalledWith({
    streamId: 'popup-desktop-stream',
    imageFormat: 'webp',
    imageQuality: 72,
  });
}

async function verifiesDesktopSelectionCancellationAndFailure() {
  mocks.chooseDesktopScreenshotSourceMock.mockResolvedValueOnce({ status: 'cancelled' });
  mocks.sendRuntimeMessageMock.mockResolvedValue({
    success: true,
    result: 'ready',
    imageFormat: 'png',
    imageQuality: 90,
    requestId: 'cancel-request',
    reservationToken: 'cancel-reservation',
  });
  await triggerQuickAction('desktop-action', true);
  expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE,
    actionId: 'desktop-action',
    tabId: 42,
  });
  expect(window.close).not.toHaveBeenCalled();

  mocks.chooseDesktopScreenshotSourceMock.mockResolvedValueOnce({
    status: 'failed',
    error: 'picker failed',
  });
  await expect(triggerQuickAction('desktop-action', true)).rejects.toThrow('picker failed');
  expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledTimes(4);
  expect(
    mocks.sendRuntimeMessageMock.mock.calls.some(
      ([message]) => message.type === MessageType.TRIGGER_QUICK_ACTION
    )
  ).toBe(true);
  expect(window.close).not.toHaveBeenCalled();
}

async function verifiesDesktopFrameFailureCancelsPreparation() {
  mocks.chooseDesktopScreenshotSourceMock.mockResolvedValue({
    status: 'selected',
    selection: { label: 'Window', streamId: 'popup-desktop-stream' },
  });
  mocks.captureDesktopScreenshotFrameMock.mockRejectedValue(new Error('frame acquisition failed'));
  mocks.sendRuntimeMessageMock.mockImplementation(async (message: { type: string }) =>
    message.type === MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE
      ? {
          success: true,
          result: 'ready',
          imageFormat: 'png',
          imageQuality: 90,
          requestId: 'failed-frame-request',
          reservationToken: 'failed-frame-reservation',
        }
      : { success: true, result: 'cancelled' }
  );

  await expect(triggerQuickAction('desktop-action', true)).rejects.toThrow(
    'frame acquisition failed'
  );
  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
    type: MessageType.TRIGGER_QUICK_ACTION,
    actionId: 'desktop-action',
    desktopSelection: {
      status: 'cancelled',
      requestId: 'failed-frame-request',
      reservationToken: 'failed-frame-reservation',
    },
    tabId: 42,
  });
  expect(window.close).not.toHaveBeenCalled();
}

function verifiesExtensionPageNavigation() {
  openImageEditor();
  openScenarioEditor();
  openGallery();
  openDesignSystem();
  openVideoEditor();
  openSettings();
  openGithubRepository();

  expect(mocks.browserTabsCreateMock).toHaveBeenCalledWith({ url: 'editor://root' });
  expect(mocks.browserTabsCreateMock).toHaveBeenCalledWith({
    url: 'scenario-editor://root',
  });
  expect(mocks.browserTabsCreateMock).toHaveBeenCalledWith({
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html',
  });
  expect(mocks.browserTabsCreateMock).toHaveBeenCalledWith({
    url: 'chrome-extension://test/apps/extension/src/design-system/index.html',
  });
  expect(mocks.browserTabsCreateMock).toHaveBeenCalledWith({
    url: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
  });
  expect(mocks.browserTabsCreateMock).toHaveBeenCalledWith({
    url: 'chrome-extension://test/apps/extension/src/settings/index.html',
  });
  expect(mocks.browserTabsCreateMock).toHaveBeenCalledWith({
    url: 'https://github.com/lrozhkov/sniptale',
  });
  expect(window.close).toHaveBeenCalledTimes(7);
}

async function verifiesRuntimeMessaging() {
  mocks.sendRuntimeMessageMock.mockResolvedValueOnce({ success: true });
  mocks.sendRuntimeMessageMock.mockResolvedValueOnce({ success: true });
  mocks.sendRuntimeMessageMock.mockResolvedValueOnce({ success: true });

  await openScreenshotMode();
  await triggerQuickAction('action-1');
  const config = {
    screenshotMode: 'visible' as const,
    viewportPresetId: null,
    delay: null,
    afterCapture: 'download_default' as const,
    imageFormat: null,
    imageQuality: null,
    exitAfterCapture: false,
  };
  await triggerScreenshotCapture(config);

  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    tabId: 42,
  });
  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
    type: MessageType.TRIGGER_QUICK_ACTION,
    actionId: 'action-1',
    tabId: 42,
  });
  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(3, {
    type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
    config,
    tabId: 42,
  });
  expect(window.close).toHaveBeenCalledTimes(3);
}

async function verifiesRuntimeErrors() {
  const closeSpy = vi.spyOn(window, 'close');

  mocks.sendRuntimeMessageMock.mockResolvedValueOnce({
    success: false,
    error: 'explicit failure',
  });
  await expect(openScreenshotMode()).rejects.toThrow('explicit failure');
  expect(closeSpy).not.toHaveBeenCalled();

  mocks.sendRuntimeMessageMock.mockResolvedValueOnce({ success: false });
  await expect(triggerQuickAction('action-2')).rejects.toThrow(
    't:popup.home.triggerQuickActionError'
  );
  expect(closeSpy).not.toHaveBeenCalled();
}

async function verifiesToolbarWorkingModeSelection() {
  mocks.sendRuntimeMessageMock.mockResolvedValueOnce({ success: true });

  await openScreenshotMode('drawing');

  expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    tabId: 42,
    workingMode: 'drawing',
  });
  expect(window.close).toHaveBeenCalledOnce();
}

async function verifiesStaleRuntimeErrors() {
  mocks.sendRuntimeMessageMock.mockResolvedValueOnce({
    success: false,
    error: 'Could not establish connection. Receiving end does not exist.',
  });
  await expect(openScreenshotMode()).rejects.toThrow('t:popup.common.stalePageRuntimeHint');

  mocks.sendRuntimeMessageMock.mockResolvedValueOnce({
    success: false,
    error: 'Could not establish connection. Receiving end does not exist.',
  });
  await expect(triggerQuickAction('action-2')).rejects.toThrow(
    't:popup.common.stalePageRuntimeHint'
  );
}

function runPopupUtilsSuite() {
  beforeEach(resetPopupUtilsMocks);

  it('opens extension pages and closes the popup window', verifiesExtensionPageNavigation);
  it(
    'starts screenshot mode and quick actions through runtime messaging',
    verifiesRuntimeMessaging
  );
  it('surfaces explicit and translated popup runtime errors', verifiesRuntimeErrors);
  it(
    'selects desktop media in the popup before runtime delivery',
    verifiesPopupOwnedDesktopSelection
  );
  it(
    'keeps the popup open when desktop selection is cancelled or fails',
    verifiesDesktopSelectionCancellationAndFailure
  );
  it(
    'cancels the prepared desktop reservation when frame acquisition fails',
    verifiesDesktopFrameFailureCancelsPreparation
  );
  it('opens tools with an explicit working mode', verifiesToolbarWorkingModeSelection);
  it('normalizes stale popup runtime errors into a refresh hint', verifiesStaleRuntimeErrors);
}

describe('popup navigation actions', runPopupUtilsSuite);
