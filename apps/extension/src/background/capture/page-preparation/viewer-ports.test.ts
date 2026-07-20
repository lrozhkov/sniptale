import { beforeEach, expect, it, vi } from 'vitest';
import {
  WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
  WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
  WEB_SNAPSHOT_VIEWER_PORT,
} from '../../../workflows/page-preparation';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  registerWebSnapshotViewerPorts,
  sendViewerPopupExportMessage,
  type WebSnapshotViewerPortRegistration,
  type WebSnapshotViewerPorts,
} from './viewer-ports';
import { createViewerPortRegistration } from './viewer-ports.test-support';

const subscribeToConnectionsMock = vi.hoisted(() => vi.fn());
const runtimeInfoGetUrlMock = vi.hoisted(() => vi.fn());
const disconnectListeners = new Set<() => void>();
const messageListeners = new Set<(message: unknown, port: chrome.runtime.Port) => void>();

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToConnections: subscribeToConnectionsMock,
  },
  runtimeInfo: {
    getURL: runtimeInfoGetUrlMock,
  },
}));

function createViewerUrl(snapshotId = 'snapshot-1'): string {
  return `chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=${snapshotId}`;
}

function createTab(tabId: number): chrome.tabs.Tab {
  return {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id: tabId,
    incognito: false,
    index: 0,
    pinned: false,
    selected: true,
    status: 'complete',
    title: 'Viewer',
    url: createViewerUrl(),
    windowId: 1,
  };
}

function createChromeEvent<TListener extends (...args: any) => void>(
  listeners: Set<TListener>
): chrome.events.Event<TListener> {
  return {
    addListener: (listener: TListener) => {
      listeners.add(listener);
    },
    addRules: vi.fn(),
    getRules: vi.fn(),
    hasListener: (listener: TListener) => listeners.has(listener),
    hasListeners: () => listeners.size > 0,
    removeListener: (listener: TListener) => {
      listeners.delete(listener);
    },
    removeRules: vi.fn(),
  };
}

function createPort(
  tabId: number,
  name = WEB_SNAPSHOT_VIEWER_PORT,
  url = createViewerUrl(),
  documentId = `viewer-document-${tabId}`
): chrome.runtime.Port {
  const port: chrome.runtime.Port = {
    disconnect: vi.fn(),
    name,
    onDisconnect: createChromeEvent(disconnectListeners),
    onMessage: createChromeEvent(messageListeners),
    postMessage: vi.fn(),
    sender: { documentId, tab: createTab(tabId), url },
  };
  return port;
}

function createRegistration(
  port: chrome.runtime.Port,
  generation = 'viewer-generation-1'
): WebSnapshotViewerPortRegistration {
  return createViewerPortRegistration(port, generation);
}

function createPorts(tabId: number, port: chrome.runtime.Port): WebSnapshotViewerPorts {
  return new Map([[tabId, createRegistration(port)]]);
}

function emitViewerExportResponse(port: chrome.runtime.Port, response: Record<string, unknown>) {
  messageListeners.forEach((listener) => listener(response, port));
}

beforeEach(() => {
  subscribeToConnectionsMock.mockReset();
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html'
  );
  disconnectListeners.clear();
  messageListeners.clear();
});

it('registers owned viewer ports and drops them on disconnect', () => {
  const listeners: Array<(port: chrome.runtime.Port) => void> = [];
  subscribeToConnectionsMock.mockImplementation((nextListener) => {
    listeners.push(nextListener);
    return vi.fn();
  });
  const ports: WebSnapshotViewerPorts = new Map();
  registerWebSnapshotViewerPorts(ports);
  const port = createPort(
    11,
    WEB_SNAPSHOT_VIEWER_PORT,
    'chrome-extension://test/apps/extension/src/web-snapshot-viewer/?snapshotId=snapshot-1'
  );

  listeners[0]?.(port);
  expect(ports.get(11)).toMatchObject({
    generation: 'viewer-document-11',
    port,
  });
  disconnectListeners.forEach((disconnect) => disconnect());
  expect(ports.has(11)).toBe(false);
});

it('rejects same-name ports from non-viewer sender URLs', () => {
  const listeners: Array<(port: chrome.runtime.Port) => void> = [];
  subscribeToConnectionsMock.mockImplementation((nextListener) => {
    listeners.push(nextListener);
    return vi.fn();
  });
  const ports: WebSnapshotViewerPorts = new Map();
  registerWebSnapshotViewerPorts(ports);

  listeners[0]?.(createPort(31, WEB_SNAPSHOT_VIEWER_PORT, 'https://example.test/page'));
  listeners[0]?.(
    createPort(
      32,
      WEB_SNAPSHOT_VIEWER_PORT,
      'chrome-extension://test/apps/extension/src/gallery/index.html'
    )
  );
  listeners[0]?.(
    createPort(
      33,
      WEB_SNAPSHOT_VIEWER_PORT,
      'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html'
    )
  );

  expect(ports.size).toBe(0);
});

it('sends popup export messages through the viewer port and resolves correlated responses', async () => {
  const port = createPort(21);
  const ports = createPorts(21, port);

  const resultPromise = sendViewerPopupExportMessage(ports, 21, {
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
  const request = vi.mocked(port.postMessage).mock.calls[0]?.[0];

  expect(request).toEqual({
    type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
    requestId: expect.any(String),
    viewerPortGeneration: 'viewer-generation-1',
    request: { type: MessageType.EXPORT_POPUP_CANCEL },
  });

  emitViewerExportResponse(port, {
    type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
    requestId: request.requestId,
    viewerPortGeneration: request.viewerPortGeneration,
    response: { success: true },
  });

  await expect(resultPromise).resolves.toEqual({ success: true });
  expect(messageListeners.size).toBe(0);
});

it('ignores export responses with mismatched request ids', async () => {
  const port = createPort(23);
  const ports = createPorts(23, port);

  const resultPromise = sendViewerPopupExportMessage(ports, 23, {
    type: MessageType.EXPORT_POPUP_CANCEL,
  });

  emitViewerExportResponse(port, {
    requestId: 'other-request',
    response: { success: true },
    type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
    viewerPortGeneration: 'viewer-generation-1',
  });

  expect(messageListeners.size).toBe(1);
  disconnectListeners.forEach((disconnect) => disconnect());
  await expect(resultPromise).rejects.toThrow('disconnected before export responded');
});

it('rejects viewer popup export messages when the viewer port disconnects', async () => {
  const port = createPort(22);
  const ports = createPorts(22, port);

  const resultPromise = sendViewerPopupExportMessage(ports, 22, {
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
  disconnectListeners.forEach((disconnect) => disconnect());

  await expect(resultPromise).rejects.toThrow('disconnected before export responded');
});

it('ignores stale generation responses and rejects when the viewer is replaced', async () => {
  const listeners: Array<(port: chrome.runtime.Port) => void> = [];
  subscribeToConnectionsMock.mockImplementation((nextListener) => {
    listeners.push(nextListener);
    return vi.fn();
  });
  const ports: WebSnapshotViewerPorts = new Map();
  registerWebSnapshotViewerPorts(ports);
  const oldPort = createPort(24, WEB_SNAPSHOT_VIEWER_PORT, createViewerUrl(), 'viewer-old');
  const nextPort = createPort(24, WEB_SNAPSHOT_VIEWER_PORT, createViewerUrl(), 'viewer-next');
  listeners[0]?.(oldPort);

  const resultPromise = sendViewerPopupExportMessage(ports, 24, {
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
  const request = vi.mocked(oldPort.postMessage).mock.calls[0]?.[0];
  emitViewerExportResponse(oldPort, {
    type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
    requestId: request.requestId,
    viewerPortGeneration: 'viewer-next',
    response: { success: true },
  });
  listeners[0]?.(nextPort);

  await expect(resultPromise).rejects.toThrow('viewer was replaced');
  expect(oldPort.disconnect).toHaveBeenCalledOnce();
  expect(ports.get(24)?.port).toBe(nextPort);
});

it('times out pending viewer popup export requests', async () => {
  vi.useFakeTimers();
  const port = createPort(25);
  const ports = createPorts(25, port);

  const resultPromise = sendViewerPopupExportMessage(ports, 25, {
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
  const rejection = expect(resultPromise).rejects.toThrow('export timed out');
  await vi.advanceTimersByTimeAsync(60000);

  await rejection;
  expect(messageListeners.size).toBe(0);
  vi.useRealTimers();
});

it('cleans up pending viewer popup export requests when posting fails', async () => {
  const port = createPort(26);
  vi.mocked(port.postMessage).mockImplementation(() => {
    throw new Error('port closed');
  });
  const ports = createPorts(26, port);

  const resultPromise = sendViewerPopupExportMessage(ports, 26, {
    type: MessageType.EXPORT_POPUP_CANCEL,
  });

  await expect(resultPromise).rejects.toThrow('port closed');
  expect(messageListeners.size).toBe(0);
  expect(disconnectListeners.size).toBe(0);
  expect(ports.get(26)?.pendingRequests.size).toBe(0);
});
