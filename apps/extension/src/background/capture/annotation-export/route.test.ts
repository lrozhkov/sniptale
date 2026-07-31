import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({
  executeDownloadBlob: vi.fn(),
  openPopup: vi.fn(),
  tabsGet: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: { openPopup: mocks.openPopup },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: mocks.tabsGet },
}));

vi.mock('../download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download/download-router')>()),
  executeDownloadBlob: mocks.executeDownloadBlob,
}));

import {
  consumePopupExportLaunchIntent,
  resetPopupExportLaunchIntentsForTests,
} from './popup-launch-intent';
import { routeToolbarAnnotationExportMessage } from './route';

beforeEach(() => {
  mocks.executeDownloadBlob.mockReset();
  mocks.openPopup.mockReset();
  mocks.tabsGet.mockReset();
  resetPopupExportLaunchIntentsForTests();
});

it('downloads exactly one Markdown Blob through the existing download owner', async () => {
  mocks.executeDownloadBlob.mockResolvedValue(41);
  const sendResponse = vi.fn();

  expect(
    routeToolbarAnnotationExportMessage({
      message: { type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS, text: '# Browser comments:\n' },
      resolvedTabId: 7,
      sendResponse,
    })
  ).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  const [blob, filename] = mocks.executeDownloadBlob.mock.calls[0]!;
  expect(blob).toBeInstanceOf(Blob);
  expect(blob.type).toBe('text/markdown;charset=utf-8');
  await expect(blob.text()).resolves.toBe('# Browser comments:\n');
  expect(filename).toBe('browser-annotations.md');
  expect(sendResponse).toHaveBeenCalledWith({ downloadId: 41, success: true });
});

it('surfaces download failure without a second effect', async () => {
  mocks.executeDownloadBlob.mockRejectedValue(new Error('download denied'));
  const sendResponse = vi.fn();

  routeToolbarAnnotationExportMessage({
    message: { type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS, text: 'annotations' },
    resolvedTabId: 7,
    sendResponse,
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(mocks.executeDownloadBlob).toHaveBeenCalledTimes(1);
  expect(sendResponse).toHaveBeenCalledWith({ error: 'download denied', success: false });
});

it('rejects a missing download id without a second effect', async () => {
  mocks.executeDownloadBlob.mockResolvedValue(undefined);
  const sendResponse = vi.fn();

  routeToolbarAnnotationExportMessage({
    message: { type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS, text: 'annotations' },
    resolvedTabId: 7,
    sendResponse,
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(mocks.executeDownloadBlob).toHaveBeenCalledTimes(1);
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Browser annotations download did not return an id.',
    success: false,
  });
});

it('opens the popup only for the active originating tab and retains its intent', async () => {
  mocks.tabsGet.mockResolvedValue({ active: true, id: 7, windowId: 3 });
  mocks.openPopup.mockResolvedValue(undefined);
  const sendResponse = vi.fn();

  routeToolbarAnnotationExportMessage({
    message: { type: MessageType.OPEN_EXPORT_MODAL },
    resolvedTabId: 7,
    sendResponse,
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(mocks.openPopup).toHaveBeenCalledWith({ windowId: 3 });
  expect(consumePopupExportLaunchIntent(7)).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
});

it('revokes launch intent when popup open fails and rejects an inactive tab', async () => {
  mocks.tabsGet.mockResolvedValueOnce({ active: true, id: 7, windowId: 3 });
  mocks.openPopup.mockRejectedValueOnce(new Error('popup denied'));
  const failedOpenResponse = vi.fn();
  routeToolbarAnnotationExportMessage({
    message: { type: MessageType.OPEN_EXPORT_MODAL },
    resolvedTabId: 7,
    sendResponse: failedOpenResponse,
  });
  await vi.waitFor(() => expect(failedOpenResponse).toHaveBeenCalled());

  expect(consumePopupExportLaunchIntent(7)).toBe(false);
  expect(failedOpenResponse).toHaveBeenCalledWith({ error: 'popup denied', success: false });

  mocks.tabsGet.mockResolvedValueOnce({ active: false, id: 7, windowId: 3 });
  const inactiveResponse = vi.fn();
  routeToolbarAnnotationExportMessage({
    message: { type: MessageType.OPEN_EXPORT_MODAL },
    resolvedTabId: 7,
    sendResponse: inactiveResponse,
  });
  await vi.waitFor(() => expect(inactiveResponse).toHaveBeenCalled());

  expect(mocks.openPopup).toHaveBeenCalledTimes(1);
  expect(inactiveResponse).toHaveBeenCalledWith({
    error: 'The originating tab is no longer active.',
    success: false,
  });
});
