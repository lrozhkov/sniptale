import { describe, expect, it } from 'vitest';

import { parseBackgroundRuntimeMessage, parseRuntimeResponseForMessage } from './boundary';
import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';

describe('strict guard-backed boundary fields', () => {
  it('rejects unknown request and response fields before routing', () => {
    expect(() =>
      parseBackgroundRuntimeMessage({
        type: CaptureMessageType.CAPTURE_VISIBLE,
        tabId: 9,
      })
    ).toThrow(MessageContractError);

    expect(() =>
      parseBackgroundRuntimeMessage({
        type: MessageType.TRIGGER_QUICK_ACTION,
        actionId: 'copy',
        unexpected: true,
      })
    ).toThrow(MessageContractError);

    expect(() =>
      parseRuntimeResponseForMessage(MessageType.TRIGGER_QUICK_ACTION, {
        success: true,
        unexpected: true,
      })
    ).toThrow(MessageContractError);
  });

  it('accepts tabId only where the runtime contract declares it', () => {
    expect(
      parseBackgroundRuntimeMessage({
        type: MessageType.TRIGGER_QUICK_ACTION,
        actionId: 'copy',
        tabId: 9,
      })
    ).toEqual({
      type: MessageType.TRIGGER_QUICK_ACTION,
      actionId: 'copy',
      tabId: 9,
    });
  });
});
