// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({
  getActiveTabId: vi.fn(),
  requestPermission: vi.fn(),
  requestPreview: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  sendPopupExportTabMessage: vi.fn(),
}));

vi.mock('../../tab-access', () => ({ getActiveTabId: mocks.getActiveTabId }));
vi.mock('./preview-request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./preview-request')>()),
  requestPopupExportPreview: mocks.requestPreview,
}));
vi.mock('./tab-message-routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tab-message-routing')>()),
  sendPopupExportTabMessage: mocks.sendPopupExportTabMessage,
}));
vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: mocks.sendRuntimeMessage,
}));
vi.mock('@sniptale/platform/browser/permissions', () => ({
  browserPermissions: { request: mocks.requestPermission },
}));

import { getDefaultPopupExportRuntimeDeps } from './default-deps';

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('provides ids, timers, and clipboard writes', async () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('123e4567-e89b-12d3-a456-426614174000');
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const deps = getDefaultPopupExportRuntimeDeps();

  expect(deps.createRequestId()).toBe('123e4567-e89b-12d3-a456-426614174000');
  await deps.writeClipboardText('payload');
  expect(writeText).toHaveBeenCalledWith('payload');
});

it('proxies the native popup-export job API and optional host permission', async () => {
  mocks.requestPermission.mockResolvedValue(true);
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true });
  const deps = getDefaultPopupExportRuntimeDeps();
  const options = {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: true,
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };

  await expect(deps.requestAllUrlsPermission?.()).resolves.toBe(true);
  await deps.sendStartJobMessage?.({
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 7, title: 'Page' }],
    type: MessageType.START_POPUP_EXPORT_JOB,
    warnings: ['permission denied'],
  });
  await deps.sendGetJobStatusMessage?.({ type: MessageType.GET_POPUP_EXPORT_JOB_STATUS });
  await deps.sendCancelJobMessage?.({ jobId: 'job-1', type: MessageType.CANCEL_POPUP_EXPORT_JOB });
  await deps.sendAckJobStatusMessage?.({ type: MessageType.ACK_POPUP_EXPORT_JOB_STATUS });

  expect(mocks.requestPermission).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledTimes(4);
});

it('proxies popup-owned tab operations and schedules callbacks', async () => {
  vi.useFakeTimers();
  mocks.getActiveTabId.mockResolvedValue(7);
  mocks.requestPreview.mockResolvedValue({ title: 'Page' });
  mocks.sendPopupExportTabMessage.mockResolvedValue({ success: true });
  const deps = getDefaultPopupExportRuntimeDeps();
  const callback = vi.fn();

  await expect(deps.getActiveTabId()).resolves.toBe(7);
  await deps.requestPreview(7, 'popup.export.prepareExportError');
  await deps.sendSaveWebSnapshotMessage?.(7, {
    requestId: 'snapshot-1',
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  });
  const timeoutId = deps.scheduleTimeout(callback, 25);
  vi.advanceTimersByTime(25);

  expect(mocks.requestPreview).toHaveBeenCalledWith(7, 'popup.export.prepareExportError');
  expect(mocks.sendPopupExportTabMessage).toHaveBeenCalledWith(7, {
    requestId: 'snapshot-1',
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  });
  expect(timeoutId).toBeDefined();
  expect(callback).toHaveBeenCalledOnce();
});
