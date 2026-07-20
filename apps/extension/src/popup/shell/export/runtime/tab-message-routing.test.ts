import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { sendPopupExportTabMessage } from './tab-message-routing';
import { installPopupRuntimeMessagingMock } from '../../runtime/services.test-support';

const mocks = vi.hoisted(() => ({
  runtimeGetURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
  sendRuntimeMessage: vi.fn(),
  sendTabMessage: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  BrowserRuntimeAdapter: undefined,
  RuntimeInfoAdapter: undefined,
  browserRuntime: {
    connect: vi.fn(),
    getManifest: vi.fn(),
    sendMessage: vi.fn(),
  },
  runtimeInfo: {
    getURL: (path: string) => mocks.runtimeGetURL(path),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  installPopupRuntimeMessagingMock((message) => mocks.sendRuntimeMessage(message));
});

function mockRuntimeCapabilityResponses(response: unknown = { success: true }) {
  mocks.sendRuntimeMessage.mockImplementation(async (message) =>
    message?.type === MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY
      ? { capabilityToken: 'cap-1', success: true }
      : response
  );
}

function createExportOptions() {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createViewerExportMessages() {
  const options = createExportOptions();
  return [
    { type: MessageType.EXPORT_POPUP_PREVIEW },
    { type: MessageType.EXPORT_POPUP_START, requestId: 'req-1', options },
    { type: MessageType.EXPORT_POPUP_BUILD_PACKAGE, options },
    { type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT, requestId: 'req-web' },
    { type: MessageType.EXPORT_POPUP_CANCEL },
  ] as const;
}

it.each(createViewerExportMessages())(
  'routes owned web snapshot viewer %s messages through background runtime messaging',
  async (message) => {
    mockRuntimeCapabilityResponses({ success: true });

    await expect(sendPopupExportTabMessage(7, message)).resolves.toEqual({ success: true });

    expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      operation: message.type,
      requestId: 'requestId' in message ? message.requestId : expect.any(String),
      tabId: 7,
      type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
    });
    expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      ...message,
      tabId: 7,
      tabRouteCapabilityToken: 'cap-1',
      tabRouteRequestId: 'requestId' in message ? message.requestId : expect.any(String),
    });
    expect(mocks.sendTabMessage).not.toHaveBeenCalled();
  }
);

it('routes invalid web snapshot viewer URLs through background runtime authorization', async () => {
  mockRuntimeCapabilityResponses({ success: false });
  const message = { type: MessageType.EXPORT_POPUP_CANCEL } as const;

  await sendPopupExportTabMessage(7, message);

  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    operation: MessageType.EXPORT_POPUP_CANCEL,
    requestId: expect.any(String),
    tabId: 7,
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  });
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    ...message,
    tabId: 7,
    tabRouteCapabilityToken: 'cap-1',
    tabRouteRequestId: expect.any(String),
  });
  expect(mocks.sendTabMessage).not.toHaveBeenCalled();
});

it('routes normal web tab export messages through background runtime authorization', async () => {
  mockRuntimeCapabilityResponses({
    preview: {
      context: 'example.test',
      jsonPreview: '{}',
      markdownPreview: '# Example',
      rowsCount: 0,
      sectionsCount: 0,
      title: 'Example',
    },
    success: true,
  });
  const message = { type: MessageType.EXPORT_POPUP_PREVIEW } as const;

  await sendPopupExportTabMessage(8, message);

  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    operation: MessageType.EXPORT_POPUP_PREVIEW,
    requestId: expect.any(String),
    tabId: 8,
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  });
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    ...message,
    tabId: 8,
    tabRouteCapabilityToken: 'cap-1',
    tabRouteRequestId: expect.any(String),
  });
  expect(mocks.sendTabMessage).not.toHaveBeenCalled();
});

it('routes normal web tab snapshot saves through background runtime authorization', async () => {
  mockRuntimeCapabilityResponses({ success: true, assetId: 'snapshot-1' });
  const message = {
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    requestId: 'req-web',
  } as const;

  await expect(sendPopupExportTabMessage(8, message)).resolves.toEqual({
    success: true,
    assetId: 'snapshot-1',
  });

  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    operation: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    requestId: 'req-web',
    tabId: 8,
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  });
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    ...message,
    tabId: 8,
    tabRouteCapabilityToken: 'cap-1',
    tabRouteRequestId: 'req-web',
  });
  expect(mocks.sendTabMessage).not.toHaveBeenCalled();
});
