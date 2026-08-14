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

vi.mock('../../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../page-access/service')>()),
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

function createExportOptions(includeFullPageScreenshot: boolean) {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot,
    includePageDiagnostics: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
  };
}

function createExportMessage(includeFullPageScreenshot: boolean): PopupExportViewerMessage {
  return {
    batchRequestId: 'req-export',
    options: createExportOptions(includeFullPageScreenshot),
    tabId: 62,
    tabRouteCapabilityToken: 'cap-1',
    tabRouteRequestId: 'req-export',
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  };
}

async function flushRouteWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  browserTabsGetMock.mockResolvedValue({ active: true, id: 62, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  isOwnedSnapshotViewerPageMock.mockReturnValue(false);
  sendTabMessageMock.mockResolvedValue({ pagePackage: {}, success: true });
});

it.each([true, false])(
  'keeps package routing data-only with full-page screenshot=%s',
  async (includeFullPageScreenshot) => {
    const sendResponse = vi.fn();

    routePopupExportMessage({
      deps: createBackgroundRuntimeState(),
      message: createExportMessage(includeFullPageScreenshot),
      resolvedTabId: 62,
      sendResponse,
      sender: undefined,
    });
    await flushRouteWork();

    const sentMessage = sendTabMessageMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(sentMessage).not.toHaveProperty('contentIntentGrant');
    expect(sentMessage).not.toHaveProperty('fullPageCaptureAction');
  }
);
