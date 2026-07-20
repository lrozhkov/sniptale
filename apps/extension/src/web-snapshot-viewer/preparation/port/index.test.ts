import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
  WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
  WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
  WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
  WEB_SNAPSHOT_VIEWER_PORT,
} from '../../../workflows/page-preparation';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { connectViewerPreparationPort } from '.';

let portMessageListener: ((message: unknown) => void) | null = null;
const postMessage = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  portMessageListener = null;
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        connect: vi.fn(() => ({
          disconnect,
          name: WEB_SNAPSHOT_VIEWER_PORT,
          onMessage: {
            addListener: (listener: (message: unknown) => void) => {
              portMessageListener = listener;
            },
            removeListener: vi.fn(),
          },
          postMessage,
        })),
      },
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

it('routes viewer export port requests and posts correlated responses', () => {
  const onCommand = vi.fn();
  const onPopupExportRequest = vi.fn((_request, sendResponse) => {
    sendResponse({ success: true });
  });

  connectViewerPreparationPort(onCommand, onPopupExportRequest);
  portMessageListener?.({
    type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
    requestId: 'port-req-1',
    viewerPortGeneration: 'viewer-generation-1',
    request: { type: MessageType.EXPORT_POPUP_CANCEL },
  });

  expect(onPopupExportRequest).toHaveBeenCalledWith(
    { type: MessageType.EXPORT_POPUP_CANCEL },
    expect.any(Function)
  );
  expect(postMessage).toHaveBeenCalledWith({
    type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
    requestId: 'port-req-1',
    viewerPortGeneration: 'viewer-generation-1',
    response: { success: true },
  });
  expect(onCommand).not.toHaveBeenCalled();
});

it('routes viewer preparation requests and posts command success', () => {
  const onCommand = vi.fn();

  connectViewerPreparationPort(onCommand);
  portMessageListener?.({
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
    command: { type: MessageType.ENABLE_SCREENSHOT_MODE, viewport: null },
    requestId: 'prep-req-1',
    viewerPortGeneration: 'viewer-generation-1',
  });

  expect(onCommand).toHaveBeenCalledWith({
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    viewport: null,
  });
  expect(postMessage).toHaveBeenCalledWith({
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
    requestId: 'prep-req-1',
    success: true,
    viewerPortGeneration: 'viewer-generation-1',
  });
});

it('reports viewer preparation request handler failures', () => {
  const onCommand = vi.fn(() => {
    throw new Error('command failed');
  });

  connectViewerPreparationPort(onCommand);
  portMessageListener?.({
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
    command: { type: MessageType.DISABLE_SCREENSHOT_MODE },
    requestId: 'prep-req-2',
    viewerPortGeneration: 'viewer-generation-1',
  });

  expect(postMessage).toHaveBeenCalledWith({
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
    error: 'command failed',
    requestId: 'prep-req-2',
    success: false,
    viewerPortGeneration: 'viewer-generation-1',
  });
});

it('ignores malformed viewer preparation port payloads', () => {
  const onCommand = vi.fn();
  const onPopupExportRequest = vi.fn();

  connectViewerPreparationPort(onCommand, onPopupExportRequest);
  portMessageListener?.({
    type: MessageType.SET_VIEWPORT,
    viewport: { height: 720, width: '1280' },
  });
  portMessageListener?.({
    request: { type: MessageType.EXPORT_POPUP_START },
    requestId: 'port-req-1',
    type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
    viewerPortGeneration: 'viewer-generation-1',
  });

  expect(onCommand).not.toHaveBeenCalled();
  expect(onPopupExportRequest).not.toHaveBeenCalled();
});
