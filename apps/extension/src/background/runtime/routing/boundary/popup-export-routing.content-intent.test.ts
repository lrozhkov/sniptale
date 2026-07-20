import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserTabsGetMock,
  ensureActivePageAccessRuntimeMock,
  isOwnedSnapshotViewerPageMock,
  sendTabMessageMock,
} = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  isOwnedSnapshotViewerPageMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: {
    get: browserTabsGetMock,
  },
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendTabMessage: sendTabMessageMock,
}));

vi.mock('../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/service')>()),
  ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
}));

vi.mock('../../../../features/tab-capabilities/url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/tab-capabilities/url')>()),
  isOwnedSnapshotViewerPage: isOwnedSnapshotViewerPageMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { routePopupExportMessage } from './popup-export-routing';
import type { PopupExportViewerMessage } from '../message-guards/guards/shared';

type ExportMessageType =
  | typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE
  | typeof MessageType.EXPORT_POPUP_START;

function createExportOptions(includeFullPageScreenshot: boolean) {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
  };
}

function createExportMessage(
  type: ExportMessageType,
  includeFullPageScreenshot: boolean
): PopupExportViewerMessage {
  const base = {
    options: createExportOptions(includeFullPageScreenshot),
    tabId: 62,
    tabRouteCapabilityToken: 'cap-1',
    tabRouteRequestId: 'req-export',
  };
  return type === MessageType.EXPORT_POPUP_START
    ? { ...base, requestId: 'req-export', type }
    : { ...base, type };
}

async function flushRouteWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  isOwnedSnapshotViewerPageMock.mockReturnValue(false);
  sendTabMessageMock.mockResolvedValue({ pagePackage: {}, success: true });
});

it.each([
  [MessageType.EXPORT_POPUP_START, true, true],
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE, true, true],
  [MessageType.EXPORT_POPUP_START, false, false],
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE, false, false],
] as const)(
  'routes %s with full-page screenshot=%s and grant=%s',
  async (type, includeFullPageScreenshot, expectsGrant) => {
    const sendResponse = vi.fn();

    routePopupExportMessage({
      deps: createBackgroundRuntimeState(),
      message: createExportMessage(type, includeFullPageScreenshot),
      resolvedTabId: 62,
      sendResponse,
      sender: undefined,
    });
    await flushRouteWork();

    const sentMessage = sendTabMessageMock.mock.calls[0]?.[1] as Record<string, unknown>;
    if (expectsGrant) {
      expect(sentMessage).toEqual(
        expect.objectContaining({
          contentIntentGrant: { grantToken: expect.any(String) },
        })
      );
      return;
    }
    expect(sentMessage).not.toHaveProperty('contentIntentGrant');
  }
);
