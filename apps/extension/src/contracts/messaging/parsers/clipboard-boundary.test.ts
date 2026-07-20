import { describe, expect, it } from 'vitest';

import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { parseContentTabMessage } from './boundary';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

function verifyClipboardTextTabMessageParsing() {
  const message = parseContentTabMessage({
    html: '<a href="https://example.test">Example</a>',
    type: MessageType.COPY_TEXT_TO_CLIPBOARD,
    text: 'copied',
  });

  expect(message).toEqual({
    html: '<a href="https://example.test">Example</a>',
    type: MessageType.COPY_TEXT_TO_CLIPBOARD,
    text: 'copied',
  });
}

function verifyOversizedClipboardTextRejected() {
  expect(() =>
    parseContentTabMessage({
      html: 'x'.repeat(50_001),
      type: MessageType.COPY_TEXT_TO_CLIPBOARD,
      text: 'copied',
    })
  ).toThrow(MessageContractError);

  expect(() =>
    parseContentTabMessage({
      type: MessageType.COPY_TEXT_TO_CLIPBOARD,
      text: 'x'.repeat(50_001),
    })
  ).toThrow(MessageContractError);
}

describe('clipboard message boundary parsing', () => {
  it('accepts valid content clipboard text tab messages', verifyClipboardTextTabMessageParsing);
  it('rejects oversized clipboard text payloads', verifyOversizedClipboardTextRejected);
});
