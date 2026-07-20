import { beforeEach, expect, it } from 'vitest';

import {
  createSendResponse,
  createSender,
  expectListenerResult,
  flushPromises,
  isBackgroundTabMessageMock,
  isScenarioMessageMock,
  isTabModeMessageMock,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeScenarioMessageMock,
  routeTabModeMessageMock,
  sendTabMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const SETTINGS_URL = 'chrome-extension://test/apps/extension/src/settings/index.html';
const UNKNOWN_EXTENSION_URL = 'chrome-extension://test/src/new-extension-page/index.html';

beforeEach(resetRuntimeMessagingMocks);

it('rejects unknown extension-page senders before privileged tab route handlers', async () => {
  const { listener, sendResponse } = registerListener();
  const tabModeMessage = { type: MessageType.ENABLE_SCREENSHOT_MODE };
  parseBackgroundRuntimeMessageMock.mockReturnValue(tabModeMessage);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isTabModeMessageMock.mockReturnValue(true);

  expectListenerResult(
    true,
    listener,
    tabModeMessage,
    createSender(17, UNKNOWN_EXTENSION_URL),
    sendResponse
  );
  await flushPromises();

  expect(routeTabModeMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized tab-mode route sender',
  });

  resetRuntimeMessagingMocks();
  const scenarioMessage = { type: MessageType.SCENARIO_SET_ENABLED, enabled: true };
  parseBackgroundRuntimeMessageMock.mockReturnValue(scenarioMessage);
  isBackgroundTabMessageMock.mockReturnValue(true);
  isScenarioMessageMock.mockReturnValue(true);
  const scenarioResponse = createSendResponse();

  expectListenerResult(
    true,
    listener,
    scenarioMessage,
    createSender(17, SETTINGS_URL),
    scenarioResponse
  );
  await flushPromises();

  expect(routeScenarioMessageMock).not.toHaveBeenCalled();
  expect(scenarioResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized scenario route sender',
  });
});

it('rejects non-popup extension pages before page-style content dispatch', async () => {
  const { listener, sendResponse } = registerListener();
  const message = { tabId: 71, type: MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isBackgroundTabMessageMock.mockReturnValue(true);

  expectListenerResult(true, listener, message, createSender(71, SETTINGS_URL), sendResponse);
  await flushPromises();

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized page-style route sender',
  });
});
