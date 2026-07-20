// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const dependencyMocks = vi.hoisted(() => ({
  getActiveTabId: vi.fn(),
  loadSettings: vi.fn(),
  requestPopupExportPreview: vi.fn(),
  sendPopupExportTabMessage: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  sendTabMessage: vi.fn(),
}));

vi.mock('../../tab-access', () => ({
  getActiveTabId: dependencyMocks.getActiveTabId,
}));

vi.mock('./preview-request', async (importOriginal) => ({
  ...(await importOriginal()),
  requestPopupExportPreview: dependencyMocks.requestPopupExportPreview,
}));

vi.mock('./tab-message-routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tab-message-routing')>()),
  sendPopupExportTabMessage: dependencyMocks.sendPopupExportTabMessage,
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal()),
  sendRuntimeMessage: dependencyMocks.sendRuntimeMessage,
  sendTabMessage: dependencyMocks.sendTabMessage,
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: dependencyMocks.loadSettings,
}));

import { getDefaultPopupExportRuntimeDeps } from './default-deps';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('builds callable default runtime deps for timers, ids, and clipboard writes', async () => {
  const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout').mockImplementation(() => undefined);
  const setTimeoutMock = vi.fn((callback: TimerHandler) => {
    if (typeof callback === 'function') {
      callback();
    }
    return 12;
  });
  vi.stubGlobal('setTimeout', setTimeoutMock);
  const randomUUIDSpy = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('123e4567-e89b-12d3-a456-426614174000');
  const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      ...originalNavigator,
      clipboard: {
        writeText: clipboardWriteText,
      },
    },
  });

  const deps = getDefaultPopupExportRuntimeDeps();
  const timeoutCallback = vi.fn();

  deps.clearTimeout(7);
  expect(clearTimeoutSpy).toHaveBeenCalledWith(7);

  expect(deps.createRequestId()).toBe('123e4567-e89b-12d3-a456-426614174000');
  expect(randomUUIDSpy).toHaveBeenCalledTimes(1);

  expect(deps.scheduleTimeout(timeoutCallback, 20)).toBe(12);
  expect(setTimeoutMock).toHaveBeenCalled();
  expect(timeoutCallback).toHaveBeenCalledTimes(1);

  await deps.writeClipboardText('payload');
  expect(clipboardWriteText).toHaveBeenCalledWith('payload');
});

it('proxies popup runtime deps through the underlying helpers', async () => {
  dependencyMocks.getActiveTabId.mockResolvedValue(42);
  dependencyMocks.requestPopupExportPreview.mockResolvedValue({ sections: [] });
  dependencyMocks.sendPopupExportTabMessage
    .mockResolvedValueOnce({ success: true })
    .mockResolvedValueOnce({ success: true })
    .mockResolvedValueOnce({ success: true });

  const deps = getDefaultPopupExportRuntimeDeps();
  const startMessage = createStartMessage();

  await expect(deps.getActiveTabId()).resolves.toBe(42);
  await expect(deps.requestPreview(4, 'popup.export.prepareExportError')).resolves.toEqual({
    sections: [],
  });
  await expect(deps.sendCancelMessage(5)).resolves.toEqual({ success: true });
  await expect(deps.sendStartMessage(8, startMessage)).resolves.toEqual({ success: true });
  await expect(
    deps.sendBuildPackageMessage(9, {
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      options: startMessage.options,
    })
  ).resolves.toEqual({ success: true });

  expectPopupRuntimeDepsProxies(startMessage);
});

function createStartMessage() {
  return {
    type: MessageType.EXPORT_POPUP_START,
    options: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includeHarDomLogs: false,
      includeImages: false,
      includeJson: true,
      includeMarkdown: false,
    },
    requestId: 'req-1',
  } as const;
}

function expectPopupRuntimeDepsProxies(startMessage: ReturnType<typeof createStartMessage>): void {
  expect(dependencyMocks.getActiveTabId).toHaveBeenCalledTimes(1);
  expect(dependencyMocks.requestPopupExportPreview).toHaveBeenCalledWith(
    4,
    'popup.export.prepareExportError'
  );
  expect(dependencyMocks.sendPopupExportTabMessage).toHaveBeenNthCalledWith(1, 5, {
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
  expect(dependencyMocks.sendPopupExportTabMessage).toHaveBeenNthCalledWith(2, 8, startMessage);
  expect(dependencyMocks.sendPopupExportTabMessage).toHaveBeenNthCalledWith(3, 9, {
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    options: startMessage.options,
  });
}

it('proxies web snapshot save requests through popup export tab routing', async () => {
  dependencyMocks.sendPopupExportTabMessage.mockResolvedValue({ success: true, warnings: [] });

  const deps = getDefaultPopupExportRuntimeDeps();

  await expect(
    deps.sendSaveWebSnapshotMessage!(10, {
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
      requestId: 'req-web',
    })
  ).resolves.toEqual({ success: true, warnings: [] });
  expect(dependencyMocks.sendPopupExportTabMessage).toHaveBeenCalledWith(10, {
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    requestId: 'req-web',
  });
});
