// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  createEditorSessionIdMock: vi.fn(() => 'session-1'),
  getActiveTabIdMock: vi.fn(async () => 42),
  getUrlMock: vi.fn((relativePath: string) => `chrome-extension://test/${relativePath}`),
  sendRuntimeMessageMock: vi.fn(),
  translateMock: vi.fn((key: string) => `t:${key}`),
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

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: mocks.createEditorSessionIdMock,
}));

vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: ({ sessionId }: { sessionId: string }) => `editor://${sessionId}`,
}));

vi.mock('../../../platform/navigation/extension-pages/scenario-editor', () => ({
  buildScenarioEditorUrl: () => 'scenario-editor://root',
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
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
} from './actions';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installPopupRuntimeMessagingMock } from '../runtime/services.test-support';

function resetPopupUtilsMocks() {
  mocks.browserTabsCreateMock.mockReset();
  mocks.createEditorSessionIdMock.mockClear();
  mocks.getActiveTabIdMock.mockClear();
  mocks.getUrlMock.mockClear();
  mocks.sendRuntimeMessageMock.mockReset();
  mocks.translateMock.mockClear();
  installPopupRuntimeMessagingMock(mocks.sendRuntimeMessageMock);
  vi.restoreAllMocks();
  vi.stubGlobal('close', vi.fn());
}

function verifiesExtensionPageNavigation() {
  openImageEditor();
  openScenarioEditor();
  openGallery();
  openDesignSystem();
  openVideoEditor();
  openSettings();
  openGithubRepository();

  expect(mocks.browserTabsCreateMock).toHaveBeenCalledWith({ url: 'editor://session-1' });
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

  await openScreenshotMode();
  await triggerQuickAction('action-1');

  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    tabId: 42,
  });
  expect(mocks.sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
    type: MessageType.TRIGGER_QUICK_ACTION,
    actionId: 'action-1',
    tabId: 42,
  });
  expect(window.close).toHaveBeenCalledTimes(2);
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
  it('normalizes stale popup runtime errors into a refresh hint', verifiesStaleRuntimeErrors);
}

describe('popup navigation actions', runPopupUtilsSuite);
