import { beforeEach, expect, it } from 'vitest';

import {
  createSender,
  expectListenerResult,
  loggerWarnMock,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeLlmSessionMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiEgressAuthority } from '../../../../features/ai/egress-authority';
import { executeImmediateRuntimeRoute } from './executor';

const VALID_CONTENT_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111';

beforeEach(resetRuntimeMessagingMocks);

function createContentAuthority(): AiEgressAuthority {
  return {
    captureMode: 'selected_editable',
    contractVersion: 1,
    payloadHash: VALID_CONTENT_HASH,
    purpose: 'content-ai-pick',
    riskClass: 'safe_text',
  };
}

it('fails closed without unknown fallback when a background-owned route has no owner executor', () => {
  const { listener, sendResponse } = registerListener();
  const sender = createSender(5, 'chrome-extension://test/apps/extension/src/settings/index.html');
  const message = {
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    type: MessageType.REQUEST_LLM_SESSION,
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);

  expectListenerResult(false, listener, message, sender, sendResponse);

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unsupported action route',
    success: false,
  });
  expect(loggerWarnMock).toHaveBeenCalledWith('Background-owned route declined message', {
    routeName: `background-owned:${MessageType.REQUEST_LLM_SESSION}`,
  });
  expect(routeLlmSessionMessageMock).toHaveBeenCalledWith(message, sender, sendResponse);
  expect(routeLlmSessionMessageMock).toHaveBeenCalledTimes(1);
});

it('reports unsupported action route when the dispatcher route handler declines the action', () => {
  const { deps, sendResponse } = registerListener();
  const sender = createSender(5);
  const message = {
    egressAuthority: createContentAuthority(),
    purpose: 'content-ai-pick',
    type: MessageType.REQUEST_LLM_SESSION,
  };

  expect(
    executeImmediateRuntimeRoute({
      logger: { warn: loggerWarnMock },
      parsedMessage: message,
      route: { kind: 'background-owned' },
      runtimeState: deps,
      sendResponse,
      sender,
    })
  ).toEqual({ done: true, keepChannelOpen: false });

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unsupported action route',
    success: false,
  });
});
