import { beforeEach, expect, it } from 'vitest';

import {
  createSender,
  expectListenerResult,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeLocalDataErasureMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { resetPopupTabRouteCapabilitiesForTests } from '../capabilities/popup-tab/route-capabilities';

beforeEach(() => {
  resetRuntimeMessagingMocks();
  resetPopupTabRouteCapabilitiesForTests();
});

it('routes local data erasure through the background-owned runtime state seam', () => {
  const { deps, listener, sendResponse } = registerListener();
  const sender = createSender(
    undefined,
    'chrome-extension://test/apps/extension/src/settings/index.html'
  );
  const message = {
    type: MessageType.ERASE_LOCAL_EXTENSION_DATA,
    includeAiProviderSecrets: false,
    preservePreferences: true,
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  routeLocalDataErasureMessageMock.mockReturnValue(true);

  expectListenerResult(true, listener, message, sender, sendResponse);
  expect(routeLocalDataErasureMessageMock).toHaveBeenCalledWith(message, sendResponse, deps);
});
