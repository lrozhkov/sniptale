import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSender,
  createTopLevelContentSender,
  expectListenerResult,
  flushPromises,
  browserTabsGetMock,
  isBackgroundTabMessageMock,
  isTabModeMessageMock,
  isVideoControlMessageMock,
  isVideoRuntimeMessageMock,
  loggerErrorMock,
  loggerWarnMock,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeTabModeMessageMock,
  routeVideoControlMessageMock,
  routeVideoRuntimeMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { routeAuthorizedTabAction as handleTabMessage } from '../tab-dispatch/adapters/dispatcher';

beforeEach(resetRuntimeMessagingMocks);

describe('background runtime message listener', () => {
  it('registers the background runtime listener through the shared runtime seam', () => {
    const { deps, subscribeMock } = registerListener();

    expect(deps.captureGuardState.isCapturing).toBe(false);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a runtime message cannot be parsed', () => {
    const { listener, sendResponse } = registerListener();
    parseBackgroundRuntimeMessageMock.mockReturnValue(null);

    expectListenerResult(false, listener, { type: 'BROKEN' }, createSender(3), sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
    expect(routeVideoControlMessageMock).not.toHaveBeenCalled();
  });

  it('passes the original sender into async tab routes', async () => {
    const { listener, sendResponse } = registerListener();
    const message = { captureMode: CaptureMode.CAMERA, type: VideoMessageType.START_RECORDING };
    const sender = createSender(
      undefined,
      'chrome-extension://test/apps/extension/src/popup/index.html'
    );

    parseBackgroundRuntimeMessageMock.mockReturnValue(message);
    isBackgroundTabMessageMock.mockReturnValue(true);
    isVideoControlMessageMock.mockReturnValue(true);

    expectListenerResult(true, listener, message, sender, sendResponse);
    await flushPromises();

    expect(routeVideoControlMessageMock).toHaveBeenCalledWith({
      message,
      resolvedTabId: undefined,
      sendResponse,
      sender,
    });
  });
});

it('fails closed before parsing when runtime freshness is missing', () => {
  const { listener, sendResponse } = registerListener();

  expect(listener({ type: VideoMessageType.OFFSCREEN_READY }, createSender(3), sendResponse)).toBe(
    false
  );

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Missing or invalid runtime message freshness',
    success: false,
  });
  expect(parseBackgroundRuntimeMessageMock).not.toHaveBeenCalled();
  expect(routeVideoControlMessageMock).not.toHaveBeenCalled();
});

it('routes parsed immediate video runtime messages through their owner', () => {
  const { listener, sendResponse } = registerListener();
  const message = { type: VideoMessageType.GET_RECORDING_STATE };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isVideoRuntimeMessageMock.mockReturnValue(true);
  routeVideoRuntimeMessageMock.mockReturnValue({ handled: true, keepChannelOpen: true });

  expectListenerResult(true, listener, message, createSender(3), sendResponse);

  expect(routeVideoRuntimeMessageMock).toHaveBeenCalledWith(
    message,
    sendResponse,
    3,
    createSender(3),
    undefined
  );
});

it('omits optional viewer ports when tab route deps do not own a registry', async () => {
  const { deps } = registerListener();
  delete (deps as Partial<typeof deps>).webSnapshotViewerPorts;
  const sendResponse = vi.fn();
  const message = { type: MessageType.ENABLE_SCREENSHOT_MODE };

  browserTabsGetMock.mockResolvedValue({
    id: 17,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1',
  });
  isTabModeMessageMock.mockReturnValue(true);
  routeTabModeMessageMock.mockReturnValue(true);

  handleTabMessage({
    deps,
    logger: { error: loggerErrorMock, warn: loggerWarnMock },
    message,
    resolvedTabId: 17,
    sendResponse,
    sender: createTopLevelContentSender(17, 'https://example.test/page'),
  });
  await flushPromises();

  const routedArgs = routeTabModeMessageMock.mock.calls[0]?.[0];
  expect(routedArgs).toBeDefined();
  expect('webSnapshotViewerPorts' in routedArgs).toBe(false);
});
